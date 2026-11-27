import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastHost } from "@/components/chrome";
import { KeeperStopHost } from "@/components/keeper/KeeperStop";
import { FxHost, LoadFailHost, OfflineHost } from "@/app/hosts";
import { CrashBoundary } from "@/app/CrashBoundary";
import { RootNavigator } from "@/app/RootNavigator";
import { queryClient } from "@/api/queries";
import { color } from "@/theme";
import { useAppFonts } from "@/theme/fonts";

/** Development builds only: Metro drops the require from release bundles (__DEV__ is false there). */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import would ship it in release
const DevMenu = __DEV__ ? (require("@/dev/DevMenu") as typeof import("@/dev/DevMenu")).DevMenu : null;

export default function App() {
  const [loaded] = useAppFonts();
  if (!loaded) return <View style={{ flex: 1, backgroundColor: color.bg.app }} />;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg.app }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ToastHost>
            <StatusBar style="light" />
            <CrashBoundary>
              <RootNavigator />
              <FxHost />
              <OfflineHost />
              <LoadFailHost />
              <KeeperStopHost />
              {DevMenu ? <DevMenu /> : null}
            </CrashBoundary>
          </ToastHost>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
