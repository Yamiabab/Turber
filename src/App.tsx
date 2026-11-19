import { useEffect } from "react";
import { AppShell } from "./components/layout/AppShell";
import { useSettingsStore } from "./core/store/useSettingsStore";
import { applyAppearance, applyTheme, applyUserCss, loadUserCss } from "./core/theme/themeEngine";
import { applyCssOverrides, loadCssOverrides } from "./core/theme/cssOverrides";

function App() {
  const appearance = useSettingsStore((state) => state.appearance);
  const userCss = useSettingsStore((state) => state.userCss);
  const setUserCss = useSettingsStore((state) => state.setUserCss);

  useEffect(() => {
    applyTheme(appearance.theme);
  }, [appearance.theme]);

  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);

  useEffect(() => {
    applyUserCss(userCss);
  }, [userCss]);

  useEffect(() => {
    if (userCss.length > 0) return;
    void loadUserCss().then((css) => {
      if (css) setUserCss(css);
    });
  }, [userCss, setUserCss]);

  useEffect(() => {
    void loadCssOverrides().then(applyCssOverrides);
  }, []);

  return <AppShell />;
}

export default App;
