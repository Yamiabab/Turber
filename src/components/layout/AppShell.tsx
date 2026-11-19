import { ChatRuntimeProvider } from "../assistant-ui/chat-runtime";
import { ControlPanelSheet } from "../control/ControlPanelSheet";
import { SettingsPanel } from "../settings/SettingsPanel";
import { UserViewGuard } from "../userview/UserViewGuard";
import { Base } from "../../pages/BaseExample";

export function AppShell() {
  return (
    <div className="bg-background text-foreground flex h-screen w-screen flex-col overflow-hidden">
      <ChatRuntimeProvider>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Base />
        </div>
      </ChatRuntimeProvider>

      <ControlPanelSheet />
      <SettingsPanel />
      <UserViewGuard />
    </div>
  );
}
