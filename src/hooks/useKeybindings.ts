import { useInput } from "ink";
import { View } from "./useRouter.js";

interface KeybindingOptions {
  navigate: (view: View) => void;
  disabled?: boolean;
}

export function useKeybindings({ navigate, disabled }: KeybindingOptions): void {
  useInput((input, key) => {
    if (disabled) return;

    if (key.ctrl && input === "p") {
      navigate("settings");
    }

    if (key.ctrl && input === "a") {
      navigate("accounts");
    }
  });
}
