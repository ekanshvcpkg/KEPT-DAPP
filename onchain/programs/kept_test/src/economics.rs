//! Versioned Oath economics. Mirrored by `src/shared/payout.ts` in the backend; keep the two in step.
//!
//! Neither `Config` nor `Oath` changes its serialized layout. The new data lives in a tagged region
//! appended after each struct, so accounts written by earlier program versions still deserialize:
//! - An Oath account of exactly `OATH_BASE_LEN` bytes predates terms and settles under rules v1.
//! - Newer Oath accounts carry `OathTerms` at `OATH_BASE_LEN`, fixed when the Oath is created.
//! - Rules v3 (the owner's money model, docs/DECISIONS.md D-91) is what every new Oath records. Its daily
//!   settlement is replayed from the `days_kept` bitmasks (`replay_v3`); v1 and v2 Oaths keep their own rules.
//! - `Economics` (rules v2 settings) can still sit after `Config`, but no longer affects new Oaths.
use anchor_lang::prelude::*;

use crate::state::{Config, Oath, MAX_MEMBERS};
use crate::KeptError;

pub const BPS_DENOMINATOR: u64 = 10_000;
/// Rules v1: no entry fee; a member who misses loses the whole stake (see `calculate_payouts`).
pub const RULES_LEGACY: u8 = 1;
/// Rules v2: fee charged on top of the stake at create/join, one freeze credit per member, and a 50% slash.
pub const RULES_V2: u8 = 2;
/// Rules v3 (owner, D-91): no entry fee; each missed day costs 10 % of the original stake, split per forfeiture
/// between that day's keepers and KEPT; HP as in design/rules.md, with the 50 % hold on a break.
pub const RULES_V3: u8 = 3;
/// What one miss costs under rules v3, in basis points of the member's original stake.
pub const MISS_BPS: u16 = 1_000;
/// Share of each member's balance held for the Rematch window when the Oath breaks (D-10); the rest goes to the treasury.
pub const BREAK_HOLD_BPS: u64 = 5_000;
/// Held money is released to the treasury this many Oath days after the break settles.
pub const HELD_WINDOW_DAYS: i64 = 7;
pub const HP_START: i32 = 100;
pub const HP_MAX: i32 = 100;
pub const HP_HEAL: i32 = 10;
pub const HP_MISS_GROUP: i32 = 20;
pub const HP_MISS_SOLO: i32 = 35;
/// Share of an unsuccessful member's stake slashed under rules v2. Once per Oath, not per missed day.
pub const SLASH_BPS: u64 = 5_000;
pub const TERMS_TAG: [u8; 8] = *b"KEPTTRM1";
pub const ECONOMICS_TAG: [u8; 8] = *b"KEPTECO1";
pub const CARRYOVER_SEED: &[u8] = b"carryover";

pub const OATH_BASE_LEN: usize = 8 + Oath::INIT_SPACE;
pub const OATH_LEN: usize = OATH_BASE_LEN + OathTerms::INIT_SPACE;
pub const CONFIG_BASE_LEN: usize = 8 + Config::INIT_SPACE;
pub const CONFIG_LEN: usize = CONFIG_BASE_LEN + Economics::INIT_SPACE;

/// Terms an Oath was created under. Amounts are stake-mint base units.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Default, PartialEq, Eq, Debug)]
pub struct OathTerms {
    pub tag: [u8; 8],
    pub rules_version: u8,
    pub fee_bps: u16,
    /// Fee each staked member pays on top of the stake; every member pays the same amount.
    pub fee_per_member: u64,
    /// Price of the one freeze credit each member may buy, fixed at creation.
    pub freeze_price: u64,
    /// Fees held in the vault. Refunded on cancel, sent to the treasury at settlement.
    pub fees_collected: u64,
    /// Freeze purchases held in the vault, sent to the treasury at settlement.
    pub freeze_proceeds: u64,
    /// Bit i: member slot i bought its freeze credit.
    pub freeze_bought: u8,
    /// Bit i: member slot i used its freeze credit.
    pub freeze_used: u8,
    /// Per member slot, the day bit covered by a freeze.
    pub frozen_days: [u16; MAX_MEMBERS],
    /// Fees + freeze proceeds + rounding dust sent to the treasury at settlement.
    pub treasury_paid: u64,
    /// Slashed stake owed to the carryover reserve because no member succeeded.
    pub carryover: u64,
    pub carryover_swept: bool,
    /// Rounding remainder of the winners' share (included in `treasury_paid`).
    pub dust: u64,
    // Rules v3 fields. They sit where `reserved: [u8; 32]` was (all zero in earlier accounts), so the layout is unchanged.
    /// Cost of one miss in basis points of the original stake; 0 for v1 / v2.
    pub miss_bps: u16,
    /// Held for the Rematch window after a break; released to the treasury by `sweep_held`.
    pub held_total: u64,
    /// Unix time from which `sweep_held` may release `held_total`.
    pub held_release_ts: i64,
    pub held_swept: bool,
    /// 0 = the Oath did not break; otherwise the 0-based break day + 1.
    pub broke_day_plus_one: u8,
    pub reserved: [u8; 12],
}

impl OathTerms {
    /// Terms every new Oath records (rules v3): no entry fee, no freezes.
    pub fn new_v3() -> Self { Self { tag: TERMS_TAG, rules_version: RULES_V3, miss_bps: MISS_BPS, ..Self::default() } }

    /// Terms for an account that predates the terms region.
    pub fn legacy() -> Self { Self { rules_version: RULES_LEGACY, ..Self::default() } }

    pub fn new(rules_version: u8, fee_bps: u16, fee_per_member: u64, freeze_price: u64) -> Self {
        Self { tag: TERMS_TAG, rules_version, fee_bps, fee_per_member, freeze_price, ..Self::default() }
    }
}

/// Rules v2 settings appended to `Config`. Its presence means rules v2 are active for new Oaths.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Default, PartialEq, Eq, Debug)]
pub struct Economics {
    pub tag: [u8; 8],
    pub fee_bps: u16,
    pub freeze_price: u64,
    /// Program-owned reserve (authority: the Config PDA). No instruction withdraws from it yet.
    pub carryover_vault: Pubkey,
    /// Total ever swept into the carryover reserve.
    pub carryover_total: u64,
    pub reserved: [u8; 32],
}

pub fn read_terms(data: &[u8]) -> Result<OathTerms> {
    if data.len() == OATH_BASE_LEN { return Ok(OathTerms::legacy()); }
    let mut tail = data.get(OATH_BASE_LEN..).ok_or(KeptError::BadOath)?;
    let terms = OathTerms::deserialize(&mut tail).map_err(|_| KeptError::BadOath)?;
    require!(terms.tag == TERMS_TAG && matches!(terms.rules_version, RULES_LEGACY | RULES_V2 | RULES_V3), KeptError::BadOath);
    Ok(terms)
}

pub fn write_terms(oath: &AccountInfo, terms: &OathTerms) -> Result<()> {
    let mut data = oath.try_borrow_mut_data()?;
    require!(data.len() >= OATH_LEN, KeptError::BadOath);
    let mut out: &mut [u8] = &mut data[OATH_BASE_LEN..];
    terms.serialize(&mut out).map_err(|_| KeptError::BadOath)?;
    Ok(())
}

/// The active rules v2 settings, or None while they have not been configured.
pub fn read_economics(data: &[u8]) -> Option<Economics> {
    let mut tail = data.get(CONFIG_BASE_LEN..)?;
    let economics = Economics::deserialize(&mut tail).ok()?;
    (economics.tag == ECONOMICS_TAG).then_some(economics)
}

pub fn write_economics(config: &AccountInfo, economics: &Economics) -> Result<()> {
    let mut data = config.try_borrow_mut_data()?;
    require!(data.len() >= CONFIG_LEN, KeptError::EconomicsNotConfigured);
    let mut out: &mut [u8] = &mut data[CONFIG_BASE_LEN..];
    economics.serialize(&mut out).map_err(|_| KeptError::EconomicsNotConfigured)?;
    Ok(())
}

/// Entry fee for one member, rounded down in the member's favour.
pub fn fee_for_stake(stake: u64, fee_bps: u16) -> Option<u64> {
    if u64::from(fee_bps) > BPS_DENOMINATOR { return None; }
    u64::try_from(u128::from(stake) * u128::from(fee_bps) / u128::from(BPS_DENOMINATOR)).ok()
}

/// Amount slashed from an unsuccessful member, rounded down in the member's favour.
pub fn slash_amount(stake: u64) -> u64 {
    // stake * 5000 / 10000 cannot exceed stake, so the narrowing is lossless.
    (u128::from(stake) * u128::from(SLASH_BPS) / u128::from(BPS_DENOMINATOR)) as u64
}

/// Days a member has satisfied: proofs recorded on chain plus any freeze-covered day.
pub fn effective_days(days_kept: u16, frozen_days: u16) -> u16 { days_kept | frozen_days }

#[derive(Debug, PartialEq, Eq)]
pub struct SettlementV2 {
    /// Per-member claimable amounts, in member order.
    pub payouts: Vec<u64>,
    /// Total slashed from unsuccessful members.
    pub slashed: u64,
    /// Fees + freeze proceeds + dust.
    pub to_treasury: u64,
    /// Slashed stake that no successful member could receive.
    pub carryover: u64,
    /// Remainder of splitting `slashed` among successful members.
    pub dust: u64,
}

/// Rules v2 settlement. Successful members get their stake back plus an equal share of the slashed
/// amount. Unsuccessful members get their stake minus one 50% slash. With no successful member the
/// slashed amount is carryover. Returns None on overflow or if the conservation check fails:
/// payouts + to_treasury + carryover = stake * members + fees + freeze proceeds.
pub fn calculate_payouts_v2(stake: u64, successes: &[bool], fees_collected: u64, freeze_proceeds: u64) -> Option<SettlementV2> {
    if successes.is_empty() { return None; }
    let members = successes.len() as u64;
    let keepers = successes.iter().filter(|v| **v).count() as u64;
    let slash = slash_amount(stake);
    let refund = stake.checked_sub(slash)?;
    let slashed = slash.checked_mul(members.checked_sub(keepers)?)?;
    let (share, carryover, dust) = if keepers == 0 {
        (0, slashed, 0)
    } else {
        let share = slashed / keepers;
        (share, 0, slashed.checked_sub(share.checked_mul(keepers)?)?)
    };
    let payouts = successes.iter().map(|won| if *won { stake.checked_add(share) } else { Some(refund) }).collect::<Option<Vec<u64>>>()?;
    let to_treasury = fees_collected.checked_add(freeze_proceeds)?.checked_add(dust)?;
    let collected = stake.checked_mul(members)?.checked_add(fees_collected)?.checked_add(freeze_proceeds)?;
    let paid = payouts.iter().try_fold(0u64, |sum, p| sum.checked_add(*p))?;
    if paid.checked_add(to_treasury)?.checked_add(carryover)? != collected { return None; }
    Some(SettlementV2 { payouts, slashed, to_treasury, carryover, dust })
}

/// What an Oath's closed days settle to under rules v3. All amounts are mint base units.
#[derive(Debug, PartialEq, Eq)]
pub struct SettlementV3 {
    /// What each member can claim, in member order. All zero when the Oath broke.
    pub payouts: Vec<u64>,
    /// Sent to the treasury at settlement: KEPT's shares and rounding remainders, days nobody kept, and on a
    /// break the half of the balances that is not held.
    pub to_treasury: u64,
    /// Held for the Rematch window after a break (released to the treasury by `sweep_held`).
    pub held: u64,
    /// Day the HP reached 0, if it did.
    pub broke_day: Option<u8>,
    pub hp: i32,
}

/// Cost of one miss: `miss_bps` of the original stake, rounded down.
pub fn miss_cost(stake: u64, miss_bps: u16) -> Option<u64> {
    u64::try_from(u128::from(stake) * u128::from(miss_bps) / u128::from(BPS_DENOMINATOR)).ok()
}

/// Replays `days` finished days from the members' `days_kept` bitmasks (bit d = day d kept) under rules v3:
/// - each missed member pays `min(miss_cost, balance)`;
/// - HP: `-20` per missed member (`-35` in a solo Oath); at 0 or below the Oath breaks that day: no heal and no
///   split, every member's start-of-day balance goes half held, half to the treasury, and all payouts are 0;
/// - otherwise, with `k` keepers, each missed member's forfeiture `p` is split on its own into `k + 1` equal
///   shares: `floor(p / (k + 1))` to each keeper and the rest (KEPT's share plus the remainder) to the treasury;
///   with no keepers all of it goes to the treasury;
/// - then HP heals by 10, up to 100.
/// Returns None on overflow or if the conservation check fails: payouts + to_treasury + held = stake * members.
pub fn replay_v3(stake: u64, miss_bps: u16, solo: bool, days_kept: &[u16], days: u8) -> Option<SettlementV3> {
    let n = days_kept.len();
    if n == 0 || n > MAX_MEMBERS || days > 16 { return None; }
    let cost = miss_cost(stake, miss_bps)?;
    let damage_per_miss = if solo { HP_MISS_SOLO } else { HP_MISS_GROUP };
    let mut balances = vec![stake; n];
    let mut to_treasury: u64 = 0;
    let mut held: u64 = 0;
    let mut hp = HP_START;
    for d in 0..days {
        let start = balances.clone();
        let mut lost = vec![0u64; n];
        for i in 0..n {
            if days_kept[i] & (1u16 << d) == 0 {
                lost[i] = cost.min(balances[i]);
                balances[i] -= lost[i];
            }
        }
        let missed = lost_count(days_kept, d);
        let after = hp - missed as i32 * damage_per_miss;
        if after <= 0 {
            let mut held_day = 0u64;
            for b in &start { held_day = held_day.checked_add((u128::from(*b) * u128::from(BREAK_HOLD_BPS) / u128::from(BPS_DENOMINATOR)) as u64)?; }
            let pot = start.iter().try_fold(0u64, |a, b| a.checked_add(*b))?;
            held = held_day;
            to_treasury = to_treasury.checked_add(pot.checked_sub(held_day)?)?;
            let total = stake.checked_mul(n as u64)?;
            if to_treasury.checked_add(held)? != total { return None; }
            return Some(SettlementV3 { payouts: vec![0; n], to_treasury, held, broke_day: Some(d), hp: 0 });
        }
        let keepers: Vec<usize> = (0..n).filter(|i| days_kept[*i] & (1u16 << d) != 0).collect();
        for p in lost.iter().copied().filter(|p| *p > 0) {
            if keepers.is_empty() { to_treasury = to_treasury.checked_add(p)?; continue; }
            let each = p / (keepers.len() as u64 + 1);
            for i in &keepers { balances[*i] = balances[*i].checked_add(each)?; }
            to_treasury = to_treasury.checked_add(p - each * keepers.len() as u64)?;
        }
        hp = (after + HP_HEAL).min(HP_MAX);
    }
    let paid = balances.iter().try_fold(0u64, |a, b| a.checked_add(*b))?;
    if paid.checked_add(to_treasury)? != stake.checked_mul(n as u64)? { return None; }
    Some(SettlementV3 { payouts: balances, to_treasury, held, broke_day: None, hp })
}

fn lost_count(days_kept: &[u16], d: u8) -> usize { days_kept.iter().filter(|m| **m & (1u16 << d) == 0).count() }

/// Number of Oath days that have fully ended at `now` (never more than `num_days`).
pub fn closed_days(start_ts: i64, day_seconds: u32, num_days: u8, now: i64) -> u8 {
    if start_ts <= 0 || day_seconds == 0 || now < start_ts { return 0; }
    let elapsed = (now - start_ts) / i64::from(day_seconds);
    elapsed.min(i64::from(num_days)).max(0) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    // Same vectors as the rules v2 tests in test/payout.test.ts.
    fn settle(stake: u64, successes: &[bool], fees: u64, freeze: u64) -> (Vec<u64>, u64, u64, u64) {
        let s = calculate_payouts_v2(stake, successes, fees, freeze).unwrap();
        (s.payouts, s.to_treasury, s.carryover, s.dust)
    }

    #[test] fn fee_is_15_percent_rounded_down() {
        assert_eq!(fee_for_stake(1_000, 1_500), Some(150));
        assert_eq!(fee_for_stake(1_250, 1_500), Some(187));
        assert_eq!(fee_for_stake(1, 1_500), Some(0));
        assert_eq!(fee_for_stake(500_000_000, 1_500), Some(75_000_000));
        assert_eq!(fee_for_stake(u64::MAX, 10_000), Some(u64::MAX));
        assert_eq!(fee_for_stake(1_000, 10_001), None);
    }
    #[test] fn all_succeed() { assert_eq!(settle(1_000, &[true; 4], 600, 0), (vec![1_000; 4], 600, 0, 0)); }
    #[test] fn one_of_four_fails_with_dust() { assert_eq!(settle(1_000, &[true, true, true, false], 600, 0), (vec![1_166, 1_166, 1_166, 500], 602, 0, 2)); }
    #[test] fn two_of_four_fail() { assert_eq!(settle(1_000, &[true, true, false, false], 600, 0), (vec![1_500, 1_500, 500, 500], 600, 0, 0)); }
    #[test] fn nobody_succeeds_goes_to_carryover() { assert_eq!(settle(1_000, &[false; 4], 600, 0), (vec![500; 4], 600, 2_000, 0)); }
    #[test] fn odd_stake_slash_rounds_for_member() { assert_eq!(settle(1_001, &[true, false], 300, 0), (vec![1_501, 501], 300, 0, 0)); }
    #[test] fn freeze_proceeds_go_to_treasury() { assert_eq!(settle(1_000, &[true, false], 300, 50), (vec![1_500, 500], 350, 0, 0)); }
    #[test] fn zero_stake_solo() { assert_eq!(settle(0, &[false], 0, 50), (vec![0], 50, 0, 0)); }
    #[test] fn overflow_is_none() {
        assert!(calculate_payouts_v2(u64::MAX, &[true, false], 0, 0).is_none());
        assert!(calculate_payouts_v2(1, &[true], u64::MAX, 1).is_none());
        assert!(calculate_payouts_v2(1, &[], 0, 0).is_none());
    }
    #[test] fn conservation_for_every_outcome() {
        for stake in [0u64, 1, 7, 999, 1_001, 500_000_000, 1_000_000_000, 2_500_000_000] {
            let fee = fee_for_stake(stake, 1_500).unwrap();
            for n in 1..=MAX_MEMBERS {
                for mask in 0..(1u32 << n) {
                    let successes: Vec<bool> = (0..n).map(|i| mask & (1 << i) != 0).collect();
                    for freeze in [0u64, 3, 1_000] {
                        let s = calculate_payouts_v2(stake, &successes, fee * n as u64, freeze).unwrap();
                        let keepers = successes.iter().filter(|v| **v).count() as u64;
                        let paid: u64 = s.payouts.iter().sum();
                        assert_eq!(paid + s.to_treasury + s.carryover, stake * n as u64 + fee * n as u64 + freeze);
                        assert_eq!(s.slashed, slash_amount(stake) * (n as u64 - keepers));
                        assert!(s.dust < keepers.max(1));
                        if keepers == 0 { assert_eq!(s.carryover, s.slashed); } else { assert_eq!(s.carryover, 0); }
                        for (i, won) in successes.iter().enumerate() {
                            if *won { assert!(s.payouts[i] >= stake); } else { assert_eq!(s.payouts[i], stake - stake / 2); }
                        }
                    }
                }
            }
        }
    }
    #[test] fn freeze_counts_as_kept() { assert_eq!(effective_days(0b101, 0b010), 0b111); }
    #[test] fn terms_round_trip_after_the_oath_struct() {
        let terms = OathTerms::new(RULES_V2, 1_500, 150, 25);
        let mut data = vec![0u8; OATH_LEN];
        let mut out: &mut [u8] = &mut data[OATH_BASE_LEN..];
        terms.serialize(&mut out).unwrap();
        assert_eq!(read_terms(&data).unwrap(), terms);
        assert_eq!(read_terms(&data[..OATH_BASE_LEN]).unwrap(), OathTerms::legacy(), "pre-terms account is rules v1");
        data[OATH_BASE_LEN] ^= 1;
        assert!(read_terms(&data).is_err(), "bad tag is rejected, not read as legacy");
        assert_eq!(OATH_BASE_LEN, 316, "existing Oath layout is unchanged");
    }

    // ---- Rules v3 ----
    const SKR: u64 = 1_000_000;
    fn v3(stake: u64, solo: bool, kept: &[u16], days: u8) -> SettlementV3 { replay_v3(stake, MISS_BPS, solo, kept, days).unwrap() }
    const ALL: u16 = 0b111;

    #[test] fn v3_all_keep_pays_the_full_stake_back() {
        let s = v3(100 * SKR, false, &[ALL; 4], 3);
        assert_eq!(s, SettlementV3 { payouts: vec![100 * SKR; 4], to_treasury: 0, held: 0, broke_day: None, hp: 100 });
    }
    #[test] fn v3_one_miss_splits_four_ways() {
        // Owner example: 4 x 100 SKR, one miss on day 1: 10 SKR / 4 = 2.5 to each of 3 keepers and KEPT.
        let s = v3(100 * SKR, false, &[ALL, ALL, ALL, 0b110], 3);
        assert_eq!(s.payouts, vec![102_500_000, 102_500_000, 102_500_000, 90_000_000]);
        assert_eq!(s.to_treasury, 2_500_000);
    }
    #[test] fn v3_two_misses_split_each_forfeiture_three_ways() {
        let s = v3(100 * SKR, false, &[ALL, ALL, 0b110, 0b110], 3);
        assert_eq!(s.payouts, vec![106_666_666, 106_666_666, 90_000_000, 90_000_000]);
        assert_eq!(s.to_treasury, 6_666_668);
    }
    #[test] fn v3_each_forfeiture_rounds_on_its_own() {
        // Stake 30 units: a miss is 3. One keeper + KEPT: 1 + 2 per forfeiture, so 2 and 4 (not 3 and 3).
        let s = v3(30, false, &[ALL, 0b110, 0b110], 3);
        assert_eq!(s.payouts, vec![32, 27, 27]);
        assert_eq!(s.to_treasury, 4);
        assert_eq!(s.payouts.iter().sum::<u64>() + s.to_treasury, 90);
    }
    #[test] fn v3_repeated_misses_cost_the_same_each_time() {
        // Member 3 misses days 0, 2, 4 of 7: 10 SKR each, split four ways.
        let kept = [0x7f, 0x7f, 0x7f, 0b1101010];
        let s = v3(100 * SKR, false, &kept, 7);
        assert_eq!(s.payouts[3], 70 * SKR);
        assert_eq!(s.payouts[0], 107_500_000);
        assert_eq!(s.to_treasury, 7_500_000);
    }
    #[test] fn v3_nobody_keeps_goes_to_the_treasury() {
        // 2 members, both miss day 0 (no keepers, damage 40 < 100): 2 x 5 SKR to the treasury.
        let s = v3(50 * SKR, false, &[0b110, 0b110], 3);
        assert_eq!(s.to_treasury, 10 * SKR);
        assert_eq!(s.payouts, vec![45 * SKR, 45 * SKR]);
    }
    #[test] fn v3_a_miss_never_takes_more_than_the_balance() {
        // HP breaks the Oath long before 10 % misses could drain a stake (eight survive, the ninth breaks), so the cap
        // never binds; the replay still uses min(cost, balance). Odd stakes round the cost down: 5 units cost 0.
        assert_eq!(miss_cost(5, MISS_BPS), Some(0));
        assert_eq!(miss_cost(1_001, MISS_BPS), Some(100));
        let eight = v3(1_000, false, &[0b0, 0xff], 8);
        assert_eq!(eight.broke_day, None);
        assert_eq!(eight.payouts[0], 200);
        assert_eq!(eight.payouts.iter().sum::<u64>() + eight.to_treasury, 2_000);
        assert_eq!(v3(1_000, false, &[0b0, 0x1ff], 9).broke_day, Some(8));
    }
    #[test] fn v3_breaking_day_holds_half_and_sends_half_to_the_treasury() {
        // 4 members, day 0: three miss (100-60+10=50), day 1: three miss again (50-60 <= 0): break on day 1.
        let kept = [ALL, 0b000, 0b000, 0b000];
        let s = v3(1_000 * SKR, false, &kept, 3);
        assert_eq!(s.broke_day, Some(1));
        assert_eq!(s.payouts, vec![0; 4]);
        // Day 0 moved 3 x 100 SKR (A +75; KEPT 75 x... each forfeiture 100/2): A 1,150; B,C,D 900 each.
        // Start-of-day-1 balances: A 1,150 + 3 x 900 = 3,850 at day 0's end... then day 1's misses are in the pot too.
        assert_eq!(s.held + s.to_treasury, 4_000 * SKR - 0);
        assert!(s.held > 0 && s.held * 2 <= 4_000 * SKR + 1);
    }
    #[test] fn v3_solo_breaks_on_the_fourth_straight_miss() {
        let s = v3(1_000, true, &[0b0000_0000], 7);
        assert_eq!(s.broke_day, Some(3));
        assert_eq!(s.payouts, vec![0]);
    }
    #[test] fn v3_replays_only_the_closed_days() {
        let early = v3(100 * SKR, false, &[0, ALL], 0);
        assert_eq!(early.payouts, vec![100 * SKR; 2]);
        assert_eq!(closed_days(1_000, 120, 3, 1_000 + 120 * 2 + 5), 2);
        assert_eq!(closed_days(1_000, 120, 3, 1_000 + 120 * 9), 3);
        assert_eq!(closed_days(1_000, 120, 3, 999), 0);
    }
    #[test] fn v3_conserves_every_token_for_every_pattern() {
        for stake in [0u64, 1, 7, 30, 999, 1_001, 100 * SKR, 1_000 * SKR + 7, 2_500 * SKR] {
            for n in 1..=MAX_MEMBERS {
                for solo in [false, true] {
                    if solo && n != 1 { continue; }
                    for pattern in 0..(1u32 << (n * 3)) {
                        let kept: Vec<u16> = (0..n).map(|i| ((pattern >> (i * 3)) & 0b111) as u16).collect();
                        let s = replay_v3(stake, MISS_BPS, solo, &kept, 3).unwrap();
                        let total = stake * n as u64;
                        assert_eq!(s.payouts.iter().sum::<u64>() + s.to_treasury + s.held, total, "stake {stake} kept {kept:?}");
                        if s.broke_day.is_none() { for (i, m) in kept.iter().enumerate() { if *m == ALL { assert!(s.payouts[i] >= stake); } } }
                    }
                }
            }
        }
    }
    /// The engine's test vectors (packages/engine/test-vectors/oath-vectors.json): the same numbers the app shows.
    #[test] fn v3_matches_the_shared_engine_vectors() {
        let file = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../packages/engine/test-vectors/oath-vectors.json")).unwrap();
        let json: serde_json::Value = serde_json::from_str(&file).unwrap();
        let vectors = json["vectors"].as_array().unwrap();
        assert!(vectors.len() >= 14);
        for v in vectors {
            let name = v["name"].as_str().unwrap();
            let terms = &v["terms"];
            let stake: u64 = terms["stake"].as_str().unwrap().parse().unwrap();
            let members = terms["members"].as_u64().unwrap() as usize;
            let solo = terms["solo"].as_bool().unwrap();
            let days = terms["days"].as_u64().unwrap() as u8;
            let miss_bps = terms["missBps"].as_u64().unwrap() as u16;
            let marks = v["marks"].as_array().unwrap();
            // Marks are one string per day, one char per member; the program replays days_kept bitmasks.
            let mut kept = vec![0u16; members];
            for (d, day) in marks.iter().enumerate() {
                for (i, c) in day.as_str().unwrap().chars().enumerate() { if c == 'k' { kept[i] |= 1 << d; } }
            }
            let s = replay_v3(stake, miss_bps, solo, &kept, days).unwrap();
            let e = &v["expected"];
            let want: Vec<u64> = e["balances"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().parse().unwrap()).collect();
            assert_eq!(s.payouts, want, "{name}: payouts");
            let fee: u64 = e["fee"].as_str().unwrap().parse().unwrap();
            let treasury: u64 = e["toTreasury"].as_str().unwrap().parse().unwrap();
            let held: u64 = e["held"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().parse::<u64>().unwrap()).sum();
            assert_eq!(s.to_treasury, fee + treasury, "{name}: treasury");
            assert_eq!(s.held, held, "{name}: held");
            assert_eq!(s.broke_day.map(u64::from), e["brokeOnDay"].as_u64(), "{name}: break day");
            assert_eq!(s.hp as u64, e["hp"].as_u64().unwrap(), "{name}: hp");
        }
    }
    #[test] fn v3_terms_round_trip_and_keep_the_layout() {
        let mut terms = OathTerms::new_v3();
        terms.held_total = 123; terms.held_release_ts = 456; terms.broke_day_plus_one = 2;
        let mut data = vec![0u8; OATH_LEN];
        let mut out: &mut [u8] = &mut data[OATH_BASE_LEN..];
        terms.serialize(&mut out).unwrap();
        assert_eq!(read_terms(&data).unwrap(), terms);
        assert_eq!(terms.rules_version, RULES_V3);
        assert_eq!(OathTerms::INIT_SPACE, 8 + 1 + 2 + 8 + 8 + 8 + 8 + 1 + 1 + 8 + 8 + 8 + 1 + 8 + 2 + 8 + 8 + 1 + 1 + 12, "same 32 reserved bytes, same size");
    }
}
