use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

pub mod state;
use state::{Config, Keeper, Member, Oath, OathStatus, MAX_MEMBERS};
pub mod economics;
use economics::*;

declare_id!("6iXXBqsdiCnUTSVf8CW3Uuw8c7iYvZSj5haz64QMuMUh");

const CONFIG_SEED: &[u8] = b"config";
const OATH_SEED: &[u8] = b"oath";
const VAULT_SEED: &[u8] = b"vault";
const KEEPER_SEED: &[u8] = b"keeper";
const KEEPER_V4_TAG: [u8; 8] = *b"KEPTV4!!";

#[program]
pub mod kept_test {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, verifier: Pubkey, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= 10_000, KeptError::InvalidFee);
        require!(ctx.accounts.treasury.mint == ctx.accounts.stake_mint.key(), KeptError::WrongMint);
        let program_state = anchor_lang::solana_program::bpf_loader_upgradeable::UpgradeableLoaderState::try_deserialize_unchecked(
            &mut &ctx.accounts.program_data.try_borrow_data()?[..],
        ).map_err(|_| KeptError::WrongAdmin)?;
        match program_state {
            anchor_lang::solana_program::bpf_loader_upgradeable::UpgradeableLoaderState::ProgramData { upgrade_authority_address: Some(key), .. }
                if key == ctx.accounts.admin.key() => (),
            _ => return err!(KeptError::WrongAdmin),
        }
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.verifier = verifier;
        c.treasury = ctx.accounts.treasury.key();
        c.fee_bps = fee_bps;
        c.stake_mint = ctx.accounts.stake_mint.key();
        c.bump = ctx.bumps.config;
        Ok(())
    }

    /// Move future protocol fees and rounding dust to a new Token or Token-2022 account.
    /// The configured admin must authorize the change; the mint cannot change here.
    pub fn update_treasury(ctx: Context<UpdateTreasury>) -> Result<()> {
        require!(ctx.accounts.treasury.mint == ctx.accounts.config.stake_mint, KeptError::WrongMint);
        ctx.accounts.config.treasury = ctx.accounts.treasury.key();
        Ok(())
    }

    /// Activates rules v2 (entry fee, freeze credits, 50% slash) for Oaths created from now on, or changes
    /// the fee/freeze price for later Oaths. Existing Oaths keep the terms they were created with.
    /// Also creates the locked carryover reserve for the stake mint.
    pub fn configure_economics(ctx: Context<ConfigureEconomics>, fee_bps: u16, freeze_price: u64) -> Result<()> {
        require!(u64::from(fee_bps) <= BPS_DENOMINATOR, KeptError::InvalidFee);
        require!(freeze_price > 0, KeptError::InvalidFreezePrice);
        let config_info = ctx.accounts.config.to_account_info();
        let previous = read_economics(&config_info.try_borrow_data()?);
        let carryover_vault = ctx.accounts.carryover_vault.key();
        if let Some(p) = previous { require_keys_eq!(p.carryover_vault, carryover_vault, KeptError::WrongCarryoverVault); }
        let economics = Economics { tag: ECONOMICS_TAG, fee_bps, freeze_price, carryover_vault,
            carryover_total: previous.map_or(0, |p| p.carryover_total), reserved: [0; 32] };
        write_economics(&config_info, &economics)?;
        emit!(EconomicsConfigured { fee_bps, freeze_price, carryover_vault });
        Ok(())
    }

    pub fn create_oath(ctx: Context<CreateOath>, oath_id: u64, goal_hash: [u8; 32], object_id: u8,
        num_days: u8, day_seconds: u32, tz_offset_minutes: i16, stake_amount: u64, is_solo: bool) -> Result<()> {
        require!(matches!(num_days, 3 | 7 | 14), KeptError::InvalidDays);
        require!(day_seconds > 0, KeptError::InvalidDayLength);
        require!(object_id < 8, KeptError::InvalidObject);
        require!((-720..=840).contains(&tz_offset_minutes), KeptError::InvalidTimezoneOffset);
        #[cfg(feature = "debug-tools")]
        require!(day_seconds == 86_400 || day_seconds == 120, KeptError::InvalidDayLength);
        #[cfg(not(feature = "debug-tools"))]
        require!(day_seconds == 86_400, KeptError::InvalidDayLength);
        require!(ctx.accounts.stake_mint.key() == ctx.accounts.config.stake_mint, KeptError::WrongMint);
        require!(ctx.accounts.treasury.mint == ctx.accounts.stake_mint.key(), KeptError::WrongMint);
        require!(ctx.accounts.creator_token.mint == ctx.accounts.stake_mint.key(), KeptError::WrongMint);
        require!(ctx.accounts.treasury.mint == ctx.accounts.stake_mint.key(), KeptError::WrongMint);
        require!(ctx.accounts.treasury.key() == ctx.accounts.config.treasury, KeptError::WrongTreasury);
        require!((!is_solo && stake_amount > 0) || (is_solo && stake_amount == 0), KeptError::InvalidStake);
        let oath = &mut ctx.accounts.oath;
        oath.creator = ctx.accounts.creator.key();
        oath.oath_id = oath_id;
        oath.stake_amount = stake_amount;
        oath.mint = ctx.accounts.stake_mint.key();
        oath.goal_hash = goal_hash;
        oath.object_id = object_id;
        oath.num_days = num_days;
        oath.day_seconds = day_seconds;
        oath.start_ts = 0;
        oath.tz_offset_minutes = tz_offset_minutes;
        oath.status = OathStatus::Open;
        oath.is_solo = is_solo;
        oath.member_count = 1;
        oath.bump = ctx.bumps.oath;
        oath.members = [Member::default(); MAX_MEMBERS];
        oath.members[0] = Member { authority: ctx.accounts.creator.key(), staked: true, days_kept: 0, claimed: false, payout: 0 };
        initialize_keeper(&mut ctx.accounts.keeper, ctx.accounts.creator.key(), ctx.bumps.keeper);
        // Every new Oath records rules v3 (the owner's money model, DECISIONS D-93): no entry fee, so a member's
        // vault balance is exactly the stake. Fixed here, so later program or Config changes cannot alter this Oath.
        // The zero-stake solo path has no tokens to escrow; group creators transfer the stake.
        let terms = OathTerms::new_v3();
        if stake_amount > 0 { transfer_stake(&ctx.accounts.token_program, &ctx.accounts.stake_mint,
            &ctx.accounts.creator_token, &ctx.accounts.vault, &ctx.accounts.creator, stake_amount)?; }
        write_terms(&oath.to_account_info(), &terms)?;
        emit!(OathCreated { oath: oath.key(), creator: oath.creator, oath_id, is_solo, stake_amount });
        Ok(())
    }

    pub fn join_oath(ctx: Context<JoinOath>) -> Result<()> {
        let oath = &mut ctx.accounts.oath;
        require!(oath.status == OathStatus::Open, KeptError::NotOpen);
        require!(!oath.is_solo, KeptError::SoloOath);
        require!(oath.member_count < MAX_MEMBERS as u8, KeptError::Full);
        require!(ctx.accounts.stake_mint.key() == oath.mint && oath.mint == ctx.accounts.config.stake_mint, KeptError::WrongMint);
        require!(ctx.accounts.member_token.mint == oath.mint, KeptError::WrongMint);
        require!(ctx.accounts.vault.owner == oath.key() && ctx.accounts.vault.mint == oath.mint, KeptError::BadVault);
        require!(ctx.accounts.stake_mint.key() == ctx.accounts.config.stake_mint, KeptError::WrongMint);
        require!(ctx.accounts.treasury.key() == ctx.accounts.config.treasury, KeptError::WrongTreasury);
        let count = oath.member_count as usize;
        require!(!oath.members[..count].iter().any(|m| m.authority == ctx.accounts.member.key()), KeptError::AlreadyMember);
        // Joiners pay the fee fixed at creation, not the current Config fee.
        let oath_info = oath.to_account_info();
        let mut terms = read_terms(&oath_info.try_borrow_data()?)?;
        let due = oath.stake_amount.checked_add(terms.fee_per_member).ok_or(KeptError::Overflow)?;
        transfer_stake(&ctx.accounts.token_program, &ctx.accounts.stake_mint, &ctx.accounts.member_token,
            &ctx.accounts.vault, &ctx.accounts.member, due)?;
        if terms.fee_per_member > 0 {
            terms.fees_collected = terms.fees_collected.checked_add(terms.fee_per_member).ok_or(KeptError::Overflow)?;
            write_terms(&oath_info, &terms)?;
            emit!(FeeCollected { oath: oath.key(), member: ctx.accounts.member.key(), amount: terms.fee_per_member });
        }
        initialize_keeper(&mut ctx.accounts.keeper, ctx.accounts.member.key(), ctx.bumps.keeper);
        let slot = oath.member_count as usize;
        oath.members[slot] = Member { authority: ctx.accounts.member.key(), staked: true, days_kept: 0, claimed: false, payout: 0 };
        oath.member_count += 1;
        emit!(OathJoined { oath: oath.key(), member: ctx.accounts.member.key() });
        Ok(())
    }

    pub fn start_oath(ctx: Context<CreatorOath>) -> Result<()> {
        let oath = &mut ctx.accounts.oath;
        require!(oath.status == OathStatus::Open, KeptError::NotOpen);
        require!(oath.is_solo || oath.member_count >= 2, KeptError::NeedsMember);
        oath.status = OathStatus::Active;
        oath.start_ts = Clock::get()?.unix_timestamp;
        emit!(OathStarted { oath: oath.key(), start_ts: oath.start_ts });
        Ok(())
    }

    pub fn cancel_oath(ctx: Context<CreatorOath>) -> Result<()> {
        let oath = &mut ctx.accounts.oath;
        require!(oath.status == OathStatus::Open, KeptError::NotOpen);
        oath.status = OathStatus::Cancelled;
        let member_count = oath.member_count as usize;
        // Each member gets back the stake and the fee they paid (0 under rules v1). Freeze credits can only
        // be bought once the Oath is Active, so there are none to refund here.
        let terms = read_terms(&oath.to_account_info().try_borrow_data()?)?;
        let refund = oath.stake_amount.checked_add(terms.fee_per_member).ok_or(KeptError::Overflow)?;
        for m in &mut oath.members[..member_count] { m.payout = if m.staked { refund } else { 0 }; }
        let refunded = oath.members[..member_count].iter().try_fold(0u64, |sum, m| sum.checked_add(m.payout)).ok_or(KeptError::Overflow)?;
        let escrowed = oath.stake_amount.checked_mul(member_count as u64).and_then(|s| s.checked_add(terms.fees_collected)).ok_or(KeptError::Overflow)?;
        require!(refunded == escrowed, KeptError::ConservationViolated);
        emit!(OathCancelled { oath: oath.key() });
        Ok(())
    }

    pub fn record_checkin(ctx: Context<RecordCheckin>, day_index: u8, proof_hash: [u8; 32]) -> Result<()> {
        require_keys_eq!(ctx.accounts.verifier.key(), ctx.accounts.config.verifier, KeptError::WrongVerifier);
        let oath = &mut ctx.accounts.oath;
        require!(oath.status == OathStatus::Active, KeptError::NotActive);
        require!(day_index < oath.num_days, KeptError::InvalidDay);
        let now = Clock::get()?.unix_timestamp;
        let day_start = oath.start_ts.checked_add(i64::from(day_index) * i64::from(oath.day_seconds)).ok_or(KeptError::Overflow)?;
        require!(now >= day_start, KeptError::DayNotStarted);
        require!(now < day_start + i64::from(oath.day_seconds), KeptError::DayEnded);
        let member_count = oath.member_count as usize;
        let oath_key = oath.key();
        let member = oath.members[..member_count].iter_mut().find(|m| m.authority == ctx.accounts.member.key()).ok_or(KeptError::NotMember)?;
        let bit = 1u16.checked_shl(u32::from(day_index)).ok_or(KeptError::InvalidDay)?;
        require!(member.days_kept & bit == 0, KeptError::DuplicateCheckin);
        member.days_kept |= bit;
        let member_key = member.authority;
        emit!(CheckinRecorded { oath: oath_key, member: member_key, day_index, proof_hash });
        Ok(())
    }

    pub fn settle_oath(ctx: Context<SettleOath>) -> Result<()> {
        let oath_info = ctx.accounts.oath.to_account_info();
        let mut terms = read_terms(&oath_info.try_borrow_data()?)?;
        let v2 = terms.rules_version == RULES_V2;
        let v3 = terms.rules_version == RULES_V3;
        let oath = &mut ctx.accounts.oath;
        require!(oath.status == OathStatus::Active, KeptError::NotActive);
        require!(ctx.accounts.vault.owner == oath.key() && ctx.accounts.vault.mint == oath.mint, KeptError::BadVault);
        let end = oath.start_ts.checked_add(i64::from(oath.num_days) * i64::from(oath.day_seconds)).ok_or(KeptError::Overflow)?;
        let now = Clock::get()?.unix_timestamp;
        let member_count = oath.member_count as usize;
        // Rules v3 replay the closed days from the proofs on chain. An Oath whose HP reached 0 may settle as soon
        // as the breaking day has closed; otherwise it settles after the last day like every other Oath.
        let v3_result = if v3 {
            let days_kept: Vec<u16> = oath.members[..member_count].iter().map(|m| m.days_kept).collect();
            let closed = closed_days(oath.start_ts, oath.day_seconds, oath.num_days, now);
            let s = replay_v3(oath.stake_amount, terms.miss_bps, oath.is_solo, &days_kept, closed).ok_or(KeptError::ConservationViolated)?;
            require!(s.broke_day.is_some() || closed == oath.num_days, KeptError::TooEarly);
            Some(s)
        } else {
            // Rules v2 wait one more Oath day so a missed last day can still be covered by a freeze.
            let settle_at = if v2 { end.checked_add(i64::from(oath.day_seconds)).ok_or(KeptError::Overflow)? } else { end };
            require!(now >= settle_at, KeptError::TooEarly);
            None
        };
        let full = if oath.num_days == 16 { u16::MAX } else { (1u16 << oath.num_days) - 1 };
        let successes: Vec<bool> = oath.members[..member_count].iter().enumerate().map(|(i, m)| match &v3_result {
            Some(s) => s.broke_day.is_none() && m.days_kept & full == full,
            None => effective_days(m.days_kept, if v2 { terms.frozen_days[i] } else { 0 }) == full,
        }).collect();
        let total_fee;
        if let Some(s) = v3_result {
            let owed = s.payouts.iter().try_fold(s.to_treasury.checked_add(s.held).ok_or(KeptError::Overflow)?, |sum, p| sum.checked_add(*p)).ok_or(KeptError::Overflow)?;
            require!(ctx.accounts.vault.amount >= owed, KeptError::VaultUnderfunded);
            for (i, payout) in s.payouts.iter().enumerate() { oath.members[i].payout = *payout; }
            if s.to_treasury > 0 {
                transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.stake_mint, &ctx.accounts.vault,
                    &ctx.accounts.treasury, &oath_info, oath.creator, oath.oath_id, oath.bump, s.to_treasury)?;
            }
            terms.treasury_paid = s.to_treasury;
            terms.held_total = s.held;
            if let Some(day) = s.broke_day {
                terms.broke_day_plus_one = day + 1;
                // Held money stays in the vault for a Rematch window of 7 Oath days, then `sweep_held` releases it.
                terms.held_release_ts = now.checked_add(HELD_WINDOW_DAYS.checked_mul(i64::from(oath.day_seconds)).ok_or(KeptError::Overflow)?).ok_or(KeptError::Overflow)?;
            }
            total_fee = s.to_treasury;
            emit!(OathSettledV3 { oath: oath.key(), to_treasury: s.to_treasury, held: s.held, broke_day_plus_one: terms.broke_day_plus_one, hp: s.hp as u8 });
        } else if v2 {
            let s = calculate_payouts_v2(oath.stake_amount, &successes, terms.fees_collected, terms.freeze_proceeds).ok_or(KeptError::ConservationViolated)?;
            let owed = s.payouts.iter().try_fold(s.to_treasury.checked_add(s.carryover).ok_or(KeptError::Overflow)?, |sum, p| sum.checked_add(*p)).ok_or(KeptError::Overflow)?;
            require!(ctx.accounts.vault.amount >= owed, KeptError::VaultUnderfunded);
            for (i, payout) in s.payouts.iter().enumerate() { oath.members[i].payout = *payout; }
            if s.to_treasury > 0 {
                transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.stake_mint, &ctx.accounts.vault,
                    &ctx.accounts.treasury, &oath_info, oath.creator, oath.oath_id, oath.bump, s.to_treasury)?;
            }
            // Carryover stays in the vault, recorded here, until sweep_carryover moves it to the reserve.
            terms.treasury_paid = s.to_treasury;
            terms.carryover = s.carryover;
            terms.dust = s.dust;
            total_fee = terms.fees_collected.checked_add(terms.freeze_proceeds).ok_or(KeptError::Overflow)?;
            emit!(OathSettledV2 { oath: oath.key(), slashed: s.slashed, to_treasury: s.to_treasury, carryover: s.carryover, dust: s.dust });
        } else {
            let (payouts, fee, dust) = calculate_payouts(oath.stake_amount, ctx.accounts.config.fee_bps, &successes).ok_or(KeptError::Overflow)?;
            if oath.stake_amount > 0 {
                for (i, payout) in payouts.iter().enumerate() { oath.members[i].payout = *payout; }
                let treasury_amount = fee + dust;
                if treasury_amount > 0 {
                    transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.stake_mint, &ctx.accounts.vault,
                        &ctx.accounts.treasury, &oath_info, oath.creator, oath.oath_id, oath.bump, treasury_amount)?;
                }
            }
            total_fee = fee;
        }
        for i in 0..oath.member_count as usize {
            let ai = ctx.remaining_accounts.get(i).ok_or(KeptError::KeeperAccountsMissing)?;
            let expected = Pubkey::find_program_address(&[KEEPER_SEED, oath.members[i].authority.as_ref()], &crate::ID).0;
            require_keys_eq!(*ai.key, expected, KeptError::BadKeeper);
            require_keys_eq!(*ai.owner, crate::ID, KeptError::BadKeeper);
            let mut data = ai.try_borrow_mut_data()?;
            let mut keeper = Keeper::try_deserialize(&mut &data[..]).map_err(|_| KeptError::BadKeeper)?;
            require_keys_eq!(keeper.authority, oath.members[i].authority, KeptError::BadKeeper);
            let succeeded = successes[i];
            if succeeded {
                if keeper.last_kept_day == oath.start_ts { keeper.current_streak = keeper.current_streak.saturating_add(u16::from(oath.num_days)); }
                else { keeper.current_streak = u16::from(oath.num_days); }
                keeper.best_streak = keeper.best_streak.max(keeper.current_streak);
                keeper.oaths_kept = keeper.oaths_kept.saturating_add(1);
                keeper.last_kept_day = end;
            } else { keeper.current_streak = 0; keeper.oaths_missed = keeper.oaths_missed.saturating_add(1); }
            let mut out: &mut [u8] = &mut data;
            keeper.try_serialize(&mut out)?;
        }
        oath.status = OathStatus::Settled;
        if v2 || v3 { write_terms(&oath_info, &terms)?; }
        emit!(OathSettled { oath: oath.key(), fee: total_fee });
        Ok(())
    }

    /// Buys this member's one freeze credit (rules v2) with un-staked SKR at the price fixed at creation.
    /// Only while Active: credits cannot be bought before the Oath starts, so cancellation never refunds one.
    pub fn buy_freeze(ctx: Context<BuyFreeze>) -> Result<()> {
        let oath_info = ctx.accounts.oath.to_account_info();
        let mut terms = read_terms(&oath_info.try_borrow_data()?)?;
        require!(terms.rules_version == RULES_V2, KeptError::LegacyRules);
        let oath = &ctx.accounts.oath;
        require!(oath.status == OathStatus::Active, KeptError::NotActive);
        require!(ctx.accounts.vault.owner == oath.key() && ctx.accounts.vault.mint == oath.mint, KeptError::BadVault);
        let slot = 1u8 << member_index(oath, &ctx.accounts.member.key())?;
        require!(terms.freeze_bought & slot == 0, KeptError::FreezeAlreadyBought);
        transfer_stake(&ctx.accounts.token_program, &ctx.accounts.stake_mint, &ctx.accounts.member_token,
            &ctx.accounts.vault, &ctx.accounts.member, terms.freeze_price)?;
        terms.freeze_bought |= slot;
        terms.freeze_proceeds = terms.freeze_proceeds.checked_add(terms.freeze_price).ok_or(KeptError::Overflow)?;
        write_terms(&oath_info, &terms)?;
        emit!(FreezeBought { oath: oath.key(), member: ctx.accounts.member.key(), price: terms.freeze_price });
        Ok(())
    }

    /// Spends this member's freeze credit on one closed day that has no recorded proof. The day then
    /// counts as kept at settlement. Only the day index comes from the client, and the program checks it.
    pub fn use_freeze(ctx: Context<UseFreeze>, day_index: u8) -> Result<()> {
        let oath_info = ctx.accounts.oath.to_account_info();
        let mut terms = read_terms(&oath_info.try_borrow_data()?)?;
        require!(terms.rules_version == RULES_V2, KeptError::LegacyRules);
        let oath = &ctx.accounts.oath;
        require!(oath.status == OathStatus::Active, KeptError::NotActive);
        require!(day_index < oath.num_days, KeptError::InvalidDay);
        let day_end = i64::from(day_index).checked_add(1).and_then(|d| d.checked_mul(i64::from(oath.day_seconds)))
            .and_then(|d| oath.start_ts.checked_add(d)).ok_or(KeptError::Overflow)?;
        require!(Clock::get()?.unix_timestamp >= day_end, KeptError::DayNotClosed);
        let i = member_index(oath, &ctx.accounts.member.key())?;
        let slot = 1u8 << i;
        require!(terms.freeze_bought & slot != 0, KeptError::NoFreezeCredit);
        require!(terms.freeze_used & slot == 0, KeptError::FreezeAlreadyUsed);
        let bit = 1u16.checked_shl(u32::from(day_index)).ok_or(KeptError::InvalidDay)?;
        require!(oath.members[i].days_kept & bit == 0, KeptError::DayAlreadyKept);
        terms.freeze_used |= slot;
        terms.frozen_days[i] |= bit;
        write_terms(&oath_info, &terms)?;
        emit!(FreezeUsed { oath: oath.key(), member: ctx.accounts.member.key(), day_index });
        Ok(())
    }

    /// Moves a settled rules v2 Oath's carryover (slashed stake with no successful member) from its vault into
    /// the locked carryover reserve. Anyone may call it; it runs once per Oath.
    pub fn sweep_carryover(ctx: Context<SweepCarryover>) -> Result<()> {
        let oath_info = ctx.accounts.oath.to_account_info();
        let config_info = ctx.accounts.config.to_account_info();
        let mut terms = read_terms(&oath_info.try_borrow_data()?)?;
        let mut economics = read_economics(&config_info.try_borrow_data()?).ok_or(KeptError::EconomicsNotConfigured)?;
        let oath = &ctx.accounts.oath;
        require!(terms.rules_version == RULES_V2, KeptError::LegacyRules);
        require!(oath.status == OathStatus::Settled, KeptError::NotSettled);
        require!(terms.carryover > 0 && !terms.carryover_swept, KeptError::NothingToSweep);
        require_keys_eq!(ctx.accounts.carryover_vault.key(), economics.carryover_vault, KeptError::WrongCarryoverVault);
        require!(ctx.accounts.vault.owner == oath.key() && ctx.accounts.vault.mint == oath.mint, KeptError::BadVault);
        transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.stake_mint, &ctx.accounts.vault,
            &ctx.accounts.carryover_vault, &oath_info, oath.creator, oath.oath_id, oath.bump, terms.carryover)?;
        terms.carryover_swept = true;
        economics.carryover_total = economics.carryover_total.checked_add(terms.carryover).ok_or(KeptError::Overflow)?;
        write_terms(&oath_info, &terms)?;
        write_economics(&config_info, &economics)?;
        emit!(CarryoverSwept { oath: oath.key(), amount: terms.carryover, reserve_total: economics.carryover_total });
        Ok(())
    }

    /// Releases the money held after a broken rules v3 Oath to the treasury once the Rematch window has passed.
    /// Anyone may call it; it runs once per Oath. (Rematch recovery is not built yet, so nothing else can claim it.)
    pub fn sweep_held(ctx: Context<SweepHeld>) -> Result<()> {
        let oath_info = ctx.accounts.oath.to_account_info();
        let mut terms = read_terms(&oath_info.try_borrow_data()?)?;
        let oath = &ctx.accounts.oath;
        require!(terms.rules_version == RULES_V3, KeptError::LegacyRules);
        require!(oath.status == OathStatus::Settled, KeptError::NotSettled);
        require!(terms.held_total > 0 && !terms.held_swept, KeptError::NothingToSweep);
        require!(Clock::get()?.unix_timestamp >= terms.held_release_ts, KeptError::TooEarly);
        require!(ctx.accounts.vault.owner == oath.key() && ctx.accounts.vault.mint == oath.mint, KeptError::BadVault);
        transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.stake_mint, &ctx.accounts.vault,
            &ctx.accounts.treasury, &oath_info, oath.creator, oath.oath_id, oath.bump, terms.held_total)?;
        terms.held_swept = true;
        write_terms(&oath_info, &terms)?;
        emit!(HeldSwept { oath: oath.key(), amount: terms.held_total });
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let oath_info = ctx.accounts.oath.to_account_info();
        let oath = &mut ctx.accounts.oath;
        require!(matches!(oath.status, OathStatus::Settled | OathStatus::Cancelled), KeptError::NotSettled);
        require!(ctx.accounts.destination.mint == oath.mint, KeptError::WrongMint);
        require!(ctx.accounts.vault.owner == oath.key() && ctx.accounts.vault.mint == oath.mint, KeptError::BadVault);
        let member_count = oath.member_count as usize;
        let oath_key = oath.key();
        let creator = oath.creator;
        let oath_id = oath.oath_id;
        let bump = oath.bump;
        let m = oath.members[..member_count].iter_mut().find(|m| m.authority == ctx.accounts.member.key()).ok_or(KeptError::NotMember)?;
        require!(!m.claimed, KeptError::AlreadyClaimed);
        let payout = m.payout;
        m.claimed = true;
        if payout > 0 { transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.stake_mint, &ctx.accounts.vault,
            &ctx.accounts.destination, &oath_info, creator, oath_id, bump, payout)?; }
        let member_key = m.authority;
        emit!(Claimed { oath: oath_key, member: member_key, amount: payout });
        Ok(())
    }

    /// Converts a pre-V4 Keeper account in place; its old XP/Soul fields are no longer used.
    pub fn migrate_keeper(ctx: Context<MigrateKeeper>) -> Result<()> {
        let keeper = &mut ctx.accounts.keeper;
        if keeper.version_tag != KEEPER_V4_TAG {
            initialize_keeper(keeper, ctx.accounts.authority.key(), ctx.bumps.keeper);
        }
        Ok(())
    }
}

/// Returns member payouts, fee and rounding dust, all in mint base units.
pub fn calculate_payouts(stake: u64, fee_bps: u16, successes: &[bool]) -> Option<(Vec<u64>, u64, u64)> {
    if successes.is_empty() || fee_bps > 10_000 { return None; }
    let keepers = successes.iter().filter(|v| **v).count();
    let broken = successes.len() - keepers;
    let mut payout = vec![0u64; successes.len()];
    if stake == 0 || broken == 0 {
        if stake > 0 { payout.fill(stake); }
        return Some((payout, 0, 0));
    }
    let (fee, dust) = if keepers == 0 {
        let per_fee = ((stake as u128) * fee_bps as u128 / 10_000) as u64;
        payout.fill(stake.checked_sub(per_fee)?);
        (per_fee.checked_mul(successes.len() as u64)?, 0)
    } else {
        let lost = stake.checked_mul(broken as u64)?;
        let fee = ((lost as u128) * fee_bps as u128 / 10_000) as u64;
        let distributable = lost.checked_sub(fee)?;
        let share = distributable / keepers as u64;
        for (i, won) in successes.iter().enumerate() { if *won { payout[i] = stake.checked_add(share)?; } }
        let distributed = share.checked_mul(keepers as u64)?;
        (fee, distributable.checked_sub(distributed)?)
    };
    Some((payout, fee, dust))
}

#[cfg(test)]
mod payout_tests {
    use super::calculate_payouts;
    #[test] fn all_keep_no_fee() { assert_eq!(calculate_payouts(1_250, 1_000, &[true; 4]), Some((vec![1_250; 4], 0, 0))); }
    #[test] fn one_of_four_misses() { assert_eq!(calculate_payouts(1_250, 1_000, &[true, true, true, false]), Some((vec![1_625, 1_625, 1_625, 0], 125, 0))); }
    #[test] fn two_of_four_miss() { assert_eq!(calculate_payouts(1_250, 1_000, &[true, true, false, false]), Some((vec![2_375, 2_375, 0, 0], 250, 0))); }
    #[test] fn all_four_miss() { assert_eq!(calculate_payouts(1_250, 1_000, &[false; 4]), Some((vec![1_125; 4], 500, 0))); }
    #[test] fn integer_dust_goes_to_treasury() { assert_eq!(calculate_payouts(1_001, 1_000, &[true, true, true, false]), Some((vec![1_301, 1_301, 1_301, 0], 100, 1))); }
    #[test] fn invalid_fee_is_rejected() { assert!(calculate_payouts(100, 10_001, &[true]).is_none()); }
}

fn transfer_stake<'info>(token: &Interface<'info, TokenInterface>, mint: &InterfaceAccount<'info, Mint>, from: &InterfaceAccount<'info, TokenAccount>, to: &InterfaceAccount<'info, TokenAccount>, authority: &Signer<'info>, amount: u64) -> Result<()> {
    token_interface::transfer_checked(CpiContext::new(token.key(), TransferChecked { from: from.to_account_info(), mint: mint.to_account_info(), to: to.to_account_info(), authority: authority.to_account_info() }), amount, mint.decimals)
}

fn member_index(oath: &Oath, member: &Pubkey) -> Result<usize> {
    oath.members[..oath.member_count as usize].iter().position(|m| m.authority == *member).ok_or_else(|| KeptError::NotMember.into())
}

fn initialize_keeper(keeper: &mut Account<Keeper>, authority: Pubkey, bump: u8) {
    if keeper.authority == Pubkey::default() || keeper.version_tag != KEEPER_V4_TAG {
        keeper.authority = authority;
        keeper.current_streak = 0;
        keeper.best_streak = 0;
        keeper.oaths_kept = 0;
        keeper.oaths_missed = 0;
        keeper.last_kept_day = -1;
        keeper.bump = bump;
        keeper.version_tag = KEEPER_V4_TAG;
        keeper.reserved = [0; 57];
    }
}

fn transfer_from_vault<'info>(token: &Interface<'info, TokenInterface>, mint: &InterfaceAccount<'info, Mint>, from: &InterfaceAccount<'info, TokenAccount>, to: &InterfaceAccount<'info, TokenAccount>, oath_info: &AccountInfo<'info>, creator: Pubkey, oath_id: u64, bump: u8, amount: u64) -> Result<()> {
    let id = oath_id.to_le_bytes();
    let bump_seed = [bump];
    let signer_seeds: &[&[u8]] = &[OATH_SEED, creator.as_ref(), &id, &bump_seed];
    token_interface::transfer_checked(CpiContext::new_with_signer(token.key(), TransferChecked {
        from: from.to_account_info(), mint: mint.to_account_info(), to: to.to_account_info(), authority: oath_info.clone(),
    }, &[signer_seeds]), amount, mint.decimals)
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(init, payer=admin, space=8+Config::INIT_SPACE, seeds=[CONFIG_SEED], bump)] pub config: Account<'info, Config>,
    #[account(mut)] pub admin: Signer<'info>,
    /// CHECK: canonical ProgramData PDA is owner checked and decoded in initialize_config.
    #[account(seeds=[crate::ID.as_ref()], bump, seeds::program=anchor_lang::solana_program::bpf_loader_upgradeable::ID, owner=anchor_lang::solana_program::bpf_loader_upgradeable::ID)] pub program_data: UncheckedAccount<'info>,
    pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)] pub treasury: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateTreasury<'info> {
    #[account(mut, seeds=[CONFIG_SEED], bump=config.bump, has_one=admin)] pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    #[account(address=config.stake_mint)] pub stake_mint: InterfaceAccount<'info, Mint>,
    pub treasury: InterfaceAccount<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct ConfigureEconomics<'info> {
    #[account(mut, seeds=[CONFIG_SEED], bump=config.bump, has_one=admin, realloc=CONFIG_LEN, realloc::payer=admin, realloc::zero=false)]
    pub config: Account<'info, Config>,
    #[account(mut)] pub admin: Signer<'info>,
    #[account(address=config.stake_mint)] pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(init_if_needed, payer=admin, seeds=[CARRYOVER_SEED, stake_mint.key().as_ref()], bump,
        token::mint=stake_mint, token::authority=config, token::token_program=token_program)]
    pub carryover_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(oath_id: u64)]
pub struct CreateOath<'info> {
    #[account(seeds=[CONFIG_SEED], bump=config.bump)] pub config: Account<'info, Config>,
    #[account(init, payer=creator, space=OATH_LEN, seeds=[OATH_SEED, creator.key().as_ref(), &oath_id.to_le_bytes()], bump)] pub oath: Account<'info, Oath>,
    #[account(init, payer=creator, seeds=[VAULT_SEED, oath.key().as_ref()], bump, token::mint=stake_mint, token::authority=oath, token::token_program=token_program)] pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(init_if_needed, payer=creator, space=8+Keeper::INIT_SPACE, seeds=[KEEPER_SEED, creator.key().as_ref()], bump)] pub keeper: Account<'info, Keeper>,
    #[account(mut)] pub creator: Signer<'info>,
    pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, constraint=creator_token.owner==creator.key())] pub creator_token: InterfaceAccount<'info, TokenAccount>,
    pub treasury: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinOath<'info> {
    #[account(seeds=[CONFIG_SEED], bump=config.bump)] pub config: Account<'info, Config>,
    #[account(mut)] pub oath: Account<'info, Oath>,
    #[account(mut, seeds=[VAULT_SEED, oath.key().as_ref()], bump)] pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(init_if_needed, payer=member, space=8+Keeper::INIT_SPACE, seeds=[KEEPER_SEED, member.key().as_ref()], bump)] pub keeper: Account<'info, Keeper>,
    #[account(mut)] pub member: Signer<'info>,
    pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, constraint=member_token.owner==member.key())] pub member_token: InterfaceAccount<'info, TokenAccount>,
    pub treasury: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)] pub struct CreatorOath<'info> { #[account(mut, has_one=creator)] pub oath: Account<'info, Oath>, pub creator: Signer<'info> }
#[derive(Accounts)] pub struct RecordCheckin<'info> { #[account(seeds=[CONFIG_SEED], bump=config.bump)] pub config: Account<'info, Config>, #[account(mut)] pub oath: Account<'info, Oath>, pub verifier: Signer<'info>, /// CHECK: authority is checked against Oath members.
    pub member: UncheckedAccount<'info> }
#[derive(Accounts)] pub struct SettleOath<'info> {
    #[account(seeds=[CONFIG_SEED], bump=config.bump)] pub config: Account<'info, Config>,
    #[account(mut)] pub oath: Account<'info, Oath>,
    #[account(mut, seeds=[VAULT_SEED, oath.key().as_ref()], bump)] pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address=config.treasury, token::mint=stake_mint)] pub treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(address=oath.mint)] pub stake_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}
#[derive(Accounts)] pub struct Claim<'info> {
    #[account(mut)] pub oath: Account<'info, Oath>,
    #[account(mut, seeds=[VAULT_SEED, oath.key().as_ref()], bump)] pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(address=oath.mint)] pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, constraint=destination.owner==member.key())] pub destination: InterfaceAccount<'info, TokenAccount>,
    pub member: Signer<'info>, pub token_program: Interface<'info, TokenInterface>,
}
#[derive(Accounts)] pub struct BuyFreeze<'info> {
    #[account(mut)] pub oath: Account<'info, Oath>,
    #[account(mut, seeds=[VAULT_SEED, oath.key().as_ref()], bump)] pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(address=oath.mint)] pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, constraint=member_token.owner==member.key(), token::mint=stake_mint)] pub member_token: InterfaceAccount<'info, TokenAccount>,
    pub member: Signer<'info>, pub token_program: Interface<'info, TokenInterface>,
}
#[derive(Accounts)] pub struct UseFreeze<'info> { #[account(mut)] pub oath: Account<'info, Oath>, pub member: Signer<'info> }
#[derive(Accounts)] pub struct SweepCarryover<'info> {
    #[account(mut, seeds=[CONFIG_SEED], bump=config.bump)] pub config: Account<'info, Config>,
    #[account(mut)] pub oath: Account<'info, Oath>,
    #[account(mut, seeds=[VAULT_SEED, oath.key().as_ref()], bump)] pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds=[CARRYOVER_SEED, stake_mint.key().as_ref()], bump)] pub carryover_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(address=oath.mint)] pub stake_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}
#[derive(Accounts)] pub struct SweepHeld<'info> {
    #[account(seeds=[CONFIG_SEED], bump=config.bump)] pub config: Account<'info, Config>,
    #[account(mut)] pub oath: Account<'info, Oath>,
    #[account(mut, seeds=[VAULT_SEED, oath.key().as_ref()], bump)] pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address=config.treasury, token::mint=stake_mint)] pub treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(address=oath.mint)] pub stake_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}
#[derive(Accounts)] pub struct MigrateKeeper<'info> {
    #[account(mut, seeds=[KEEPER_SEED, authority.key().as_ref()], bump, has_one=authority,
        realloc=8+Keeper::INIT_SPACE, realloc::payer=authority, realloc::zero=true)]
    pub keeper: Account<'info, Keeper>,
    #[account(mut)] pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[event] pub struct OathCreated { pub oath: Pubkey, pub creator: Pubkey, pub oath_id: u64, pub is_solo: bool, pub stake_amount: u64 }
#[event] pub struct OathJoined { pub oath: Pubkey, pub member: Pubkey }
#[event] pub struct OathStarted { pub oath: Pubkey, pub start_ts: i64 }
#[event] pub struct OathCancelled { pub oath: Pubkey }
#[event] pub struct CheckinRecorded { pub oath: Pubkey, pub member: Pubkey, pub day_index: u8, pub proof_hash: [u8;32] }
#[event] pub struct OathSettled { pub oath: Pubkey, pub fee: u64 }
#[event] pub struct Claimed { pub oath: Pubkey, pub member: Pubkey, pub amount: u64 }
#[event] pub struct EconomicsConfigured { pub fee_bps: u16, pub freeze_price: u64, pub carryover_vault: Pubkey }
#[event] pub struct FeeCollected { pub oath: Pubkey, pub member: Pubkey, pub amount: u64 }
#[event] pub struct FreezeBought { pub oath: Pubkey, pub member: Pubkey, pub price: u64 }
#[event] pub struct FreezeUsed { pub oath: Pubkey, pub member: Pubkey, pub day_index: u8 }
#[event] pub struct OathSettledV2 { pub oath: Pubkey, pub slashed: u64, pub to_treasury: u64, pub carryover: u64, pub dust: u64 }
#[event] pub struct OathSettledV3 { pub oath: Pubkey, pub to_treasury: u64, pub held: u64, pub broke_day_plus_one: u8, pub hp: u8 }
#[event] pub struct HeldSwept { pub oath: Pubkey, pub amount: u64 }
#[event] pub struct CarryoverSwept { pub oath: Pubkey, pub amount: u64, pub reserve_total: u64 }

#[error_code] pub enum KeptError {
    #[msg("Fee basis points must be at most 10000")] InvalidFee,
    #[msg("Only the program upgrade authority may initialize Config")] WrongAdmin,
    #[msg("Invalid oath duration")] InvalidDays,
    #[msg("Object id is not in the supported object list")] InvalidObject,
    #[msg("Timezone offset must be UTC-12 through UTC+14")] InvalidTimezoneOffset,
    #[msg("Day length must be positive")] InvalidDayLength,
    #[msg("Stake mint does not match config or oath")] WrongMint,
    #[msg("Treasury token account does not match config")] WrongTreasury,
    #[msg("Invalid solo or group stake configuration")] InvalidStake,
    #[msg("Oath is not open")] NotOpen,
    #[msg("Oath is solo and cannot be joined")] SoloOath,
    #[msg("Oath has four members already")] Full,
    #[msg("Wallet is already a member")] AlreadyMember,
    #[msg("Group Oath needs at least one other member")] NeedsMember,
    #[msg("Only configured verifier can record check-ins")] WrongVerifier,
    #[msg("Oath is not active")] NotActive,
    #[msg("Day index outside oath duration")] InvalidDay,
    #[msg("Check-in day has not started")] DayNotStarted,
    #[msg("Check-in day has ended")] DayEnded,
    #[msg("Wallet is not an Oath member")] NotMember,
    #[msg("Check-in already recorded")] DuplicateCheckin,
    #[msg("Oath cannot settle yet")] TooEarly,
    #[msg("Missing Keeper account for a member")] KeeperAccountsMissing,
    #[msg("Bad Keeper account supplied")] BadKeeper,
    #[msg("Vault does not cover calculated payouts")] VaultUnderfunded,
    #[msg("Vault authority or mint is invalid")] BadVault,
    #[msg("Oath account data is invalid")] BadOath,
    #[msg("Oath is not settled or cancelled")] NotSettled,
    #[msg("Payout already claimed")] AlreadyClaimed,
    #[msg("Arithmetic overflow")] Overflow,
    #[msg("Freeze price must be positive")] InvalidFreezePrice,
    #[msg("Oath uses legacy rules without fees or freezes")] LegacyRules,
    #[msg("No freeze credit bought")] NoFreezeCredit,
    #[msg("Freeze credit already bought")] FreezeAlreadyBought,
    #[msg("Freeze credit already used")] FreezeAlreadyUsed,
    #[msg("A freeze can only cover a day that has closed")] DayNotClosed,
    #[msg("Day already kept")] DayAlreadyKept,
    #[msg("No carryover to sweep")] NothingToSweep,
    #[msg("Carryover reserve does not match config")] WrongCarryoverVault,
    #[msg("Rules v2 economics are not configured")] EconomicsNotConfigured,
    #[msg("Settlement does not account for every escrowed token")] ConservationViolated,
}
