/**
 * Turber 网页端 —— 原生 Material UI（https://mui.com/）
 * 规则：全部使用 MUI 官方组件与官方默认主题（createTheme() 默认值，不做任何
 * 样式覆盖、不改组件规范、不引入自定义 CSS）。唯一的可选配置是 MUI 官方支持的
 * palette.mode 跟随系统深浅色。文案全部走 ui/i18n.js 词典，支持中英切换。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

/* MUI 官方文档推荐的 Roboto 字体引入方式 */
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Avatar from "@mui/material/Avatar";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";

import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import LanguageIcon from "@mui/icons-material/Language";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import DriveFileRenameOutlineOutlinedIcon from "@mui/icons-material/DriveFileRenameOutlineOutlined";
import LockResetOutlinedIcon from "@mui/icons-material/LockResetOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import WidgetsOutlinedIcon from "@mui/icons-material/WidgetsOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import DevicesOutlinedIcon from "@mui/icons-material/DevicesOutlined";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import Collapse from "@mui/material/Collapse";
import Fade from "@mui/material/Fade";
import Slide from "@mui/material/Slide";

import {
  I18nContext,
  LANGUAGES,
  LANG_KEY,
  detectLanguage,
  translate,
  useI18n,
} from "./i18n.js";

/* ────────────────────────────── 基础工具 ────────────────────────────── */

const TOKEN_KEY = "turber.web.token";
const REMEMBER_KEY = "turber.remember.username";

function readRememberedUser() {
  try {
    return localStorage.getItem(REMEMBER_KEY) || "";
  } catch {
    return "";
  }
}
const DRAWER_WIDTH = 240;

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 忽略 */
  }
}

async function request(path, { method = "GET", body } = {}) {
  try {
    const res = await fetch(path, {
      method,
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function fmtDateTime(ts, lang) {
  if (!ts) return "—";
  return new Date(Number(ts)).toLocaleString(lang === "zh-CN" ? "zh-CN" : "en-US", {
    hour12: lang !== "zh-CN",
  });
}

function fmtDate(ts, lang) {
  if (!ts) return "—";
  return new Date(Number(ts)).toLocaleDateString(lang === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

const STATUS_COLOR = {
  pending: "success",
  used: "default",
  revoked: "default",
  expired: "warning",
};

function StatusChip({ status }) {
  const { t } = useI18n();
  const key = `status.${["pending", "used", "revoked", "expired"].includes(status) ? status : "used"}`;
  return (
    <Chip
      size="small"
      label={t(key)}
      color={STATUS_COLOR[status] ?? "default"}
      variant="outlined"
    />
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 把选中的图片居中裁剪成 256×256 的正方形，导出 jpeg dataURL。 */
function cropToSquareDataUrl(file, size = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("decode_failed"));
      image.onload = () => {
        try {
          const side = Math.min(image.width, image.height);
          const offsetX = (image.width - side) / 2;
          const offsetY = (image.height - side) / 2;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("canvas_failed"));
            return;
          }
          ctx.drawImage(image, offsetX, offsetY, side, side, 0, 0, size, size);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch (error) {
          reject(error);
        }
      };
      image.src = String(reader.result ?? "");
    };
    reader.readAsDataURL(file);
  });
}

/* ────────────────────────────── 语言切换 ────────────────────────────── */

function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  const [anchor, setAnchor] = useState(null);

  return (
    <>
      <Tooltip title={t("lang.label")}>
        <IconButton
          aria-label={t("lang.label")}
          aria-haspopup="true"
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <LanguageIcon />
        </IconButton>
      </Tooltip>
      <Menu
       anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
      >
        {LANGUAGES.map((item) => (
          <MenuItem
            key={item.id}
            selected={item.id === lang}
            onClick={() => {
              setLang(item.id);
              setAnchor(null);
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/* ────────────────────────────── 登录页 ────────────────────────────── */

/* 解析颜色为 [r, g, b]，兼容 hex 与 rgb()/rgba() */
function parseColorChannels(value, fallback) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value || "").trim());
  if (hex) {
    const raw = hex[1];
    const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  const rgb = /rgba?\(([^)]+)\)/i.exec(String(value || ""));
  if (rgb) {
    const parts = rgb[1].split(",").map((item) => Number.parseFloat(item));
    if (parts.length >= 3 && parts.slice(0, 3).every((item) => Number.isFinite(item))) {
      return [Math.round(parts[0]), Math.round(parts[1]), Math.round(parts[2])];
    }
  }
  return fallback;
}

/* 登录页背景：统一蓝色方块组成的横向波带，自右边缘向左延伸并渐隐 */
function LoginWaveBackdrop() {
  const canvasRef = useRef(null);
  const theme = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const host = canvas.parentElement;
    if (!host) return undefined;

    const blue = parseColorChannels(theme.palette.primary.main, [25, 118, 210]);
    const isDark = theme.palette.mode === "dark";
    const CELL = 30;
    const GAP = 4;

    let sizedW = 0;
    let sizedH = 0;
    let sizedDpr = 0;

    const paint = (time = 0) => {
      const width = host.clientWidth || window.innerWidth;
      const height = host.clientHeight || window.innerHeight;
      if (!width || !height) return;
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      /* 仅在尺寸变化时重建位图，动画帧只做重绘 */
      if (width !== sizedW || height !== sizedH || dpr !== sizedDpr) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        sizedW = width;
        sizedH = height;
        sizedDpr = dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const cols = Math.ceil(width / CELL);
      const totalRows = Math.ceil(height / CELL);
      const size = CELL - GAP;
      const edgeAlpha = isDark ? 0.42 : 0.28;

      /* 横向波带：每条从右边缘向左延伸；纵向上下顶满整屏，宽度半屏 */
      const bandCols = Math.max(6, Math.round(cols * 0.5)); /* 半屏宽 */
      const midRow = (totalRows - 1) / 2;
      const halfRows = Math.max(3, Math.ceil(totalRows * 0.5)); /* 覆盖到上下边缘 */
      const minLen = Math.max(2, Math.round(bandCols * 0.06)); /* 上下边缘也留可见短条 */
      /* 稳定伪随机：同一条重绘时长度不变，避免 resize 抖动 */
      const noise = (seed) => {
        const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
        return v - Math.floor(v);
      };

      for (let row = 0; row < totalRows; row += 1) {
        const dy = Math.abs(row - midRow);
        /* 靠中线最长，向上下两侧缓衰减，到边缘仍保留短条 */
        const vertical = Math.pow(Math.max(0, 1 - dy / (halfRows + 1)), 0.45);
        if (vertical <= 0.01) continue;
        /* 每条长度独立随机，并按自身相位随时间律动，形成音乐波形跳动 */
        const phase = noise(row + 11.3) * Math.PI * 2;
        const speed = 0.85 + noise(row + 17.9) * 1.15;
        const pulse =
          0.84 +
          0.17 * Math.sin(time * speed + phase) +
          0.07 * Math.sin(time * speed * 2.3 + phase * 1.7);
        const len = Math.min(
          bandCols,
          Math.max(
            minLen,
            Math.round(bandCols * vertical * (0.42 + 0.58 * noise(row + 3.7)) * pulse),
          ),
        );
        const startCol = Math.max(0, cols - len);
        const rowAlpha = edgeAlpha * (0.14 + 0.86 * vertical);
        const spanLen = Math.max(1, cols - 1 - startCol);

        for (let col = cols - 1; col >= startCol; col -= 1) {
          const t = (cols - 1 - col) / spanLen; /* 0 = 右端，1 = 最左端 */
          const alpha = rowAlpha * Math.pow(1 - t, 1.15);
          if (alpha < 0.004) continue;
          ctx.fillStyle = `rgba(${blue[0]}, ${blue[1]}, ${blue[2]}, ${alpha.toFixed(3)})`;
          ctx.fillRect(col * CELL + GAP / 2, row * CELL + GAP / 2, size, size);
        }
      }
    };

    paint(0);

    /* 约 30fps 的律动动画；系统开启"减弱动态效果"时保持静态 */
    let rafId = 0;
    let lastDraw = 0;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const loop = (ts) => {
      rafId = window.requestAnimationFrame(loop);
      if (document.hidden) return;
      if (ts - lastDraw < 33) return;
      lastDraw = ts;
      paint(ts / 1000);
    };

    if (!reduceMotion) rafId = window.requestAnimationFrame(loop);

    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => paint(lastDraw / 1000));
      observer.observe(host);
    }
    const handleResize = () => paint(lastDraw / 1000);
    window.addEventListener("resize", handleResize);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [theme]);

  return (
    <Box
      component="canvas"
      ref={canvasRef}
      aria-hidden="true"
      sx={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}

function LoginPage() {
  const { t } = useI18n();
  const [username, setUsername] = useState(() => readRememberedUser());
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(() => Boolean(readRememberedUser()));
  const [step, setStep] = useState(1);
  const [stepDir, setStepDir] = useState("left");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const token = readToken();
    if (!token) return undefined;
    let alive = true;
    request(`/api/session?token=${encodeURIComponent(token)}`).then((result) => {
      if (!alive) return;
      if (result.ok && result.data?.user) {
        window.location.replace("/account");
      } else {
        clearToken();
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const name = username.trim();
    if (step === 1) {
      if (!name) {
        setFeedback({ severity: "error", text: t("login.missingAccount") });
        return;
      }
      setFeedback(null);
      setStepDir("left");
      setStep(2);
      return;
    }
    if (!name || !password) {
      setFeedback({ severity: "error", text: t("login.missing") });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    const result = await request("/api/login", {
      method: "POST",
      body: { username: name, password },
    });
    if (result.ok && result.data?.ok && result.data.token) {
      try {
        localStorage.setItem(TOKEN_KEY, result.data.token);
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, name);
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
      } catch {
        /* 忽略 */
      }
      setFeedback({ severity: "success", text: t("login.success") });
      window.location.replace("/account");
      return;
    }
    setSubmitting(false);
    setFeedback({
      severity: "error",
      text: result.data?.message || t("login.fail"),
    });
  };

  return (
    <Box
      sx={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      <LoginWaveBackdrop />
      <Box sx={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "flex-end", p: 1.5 }}>
        <LanguageSwitcher />
      </Box>

      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          flexGrow: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          px: { xs: 2, sm: 6, md: 12 },
          py: 2,
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 404 }}>
          <Box sx={{ p: 4 }}>
            <Slide
              key={`login-step-${step}`}
              in
              appear
              direction={stepDir}
              timeout={380}
              mountOnEnter
              unmountOnExit
            >
              <Box>
                <Fade in appear timeout={380}>
                  <Box>
                    <Stack spacing={1} alignItems="flex-start" sx={{ mb: 3 }}>
                      <Typography
                        variant="h4"
                        component="h1"
                        title={step === 2 ? username.trim() : undefined}
                        sx={{ pt: 1, fontWeight: 600, wordBreak: "break-all" }}
                      >
                        {step === 1
                          ? t("login.title")
                          : `${t("login.signInToPrefix")}${username.trim()}`}
                      </Typography>
                      <Collapse in={step === 1} timeout={320}>
                        <Typography variant="body2" color="text.secondary">
                          {t("login.subtitle")}
                        </Typography>
                      </Collapse>
                    </Stack>

                    <Box component="form" noValidate onSubmit={handleSubmit}>
                      <Stack spacing={3}>
                        {step === 1 ? (
                          <Collapse in appear timeout={320}>
                            <Stack spacing={3}>
                              <TextField
                                variant="standard"
                                label={t("login.account")}
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                autoComplete="username"
                                autoFocus
                                fullWidth
                                disabled={submitting}
                              />
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={remember}
                                    onChange={(event) => setRemember(event.target.checked)}
                                    disabled={submitting}
                                    size="small"
                                  />
                                }
                                label={t("login.remember")}
                                sx={{
                                  ml: -0.5,
                                  "& .MuiFormControlLabel-label": { fontSize: 14 },
                                }}
                              />
                            </Stack>
                          </Collapse>
                        ) : (
                          <Collapse in appear timeout={320}>
                            <Stack spacing={3}>
                              <TextField
                                variant="standard"
                                label={t("login.password")}
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete="current-password"
                                autoFocus
                                fullWidth
                                disabled={submitting}
                                slotProps={{
                                  input: {
                                    endAdornment: (
                                      <InputAdornment position="end">
                                        <Tooltip
                                          title={
                                            showPassword
                                              ? t("login.hidePassword")
                                              : t("login.showPassword")
                                          }
                                        >
                                          <IconButton
                                            aria-label={
                                              showPassword
                                                ? t("login.hidePassword")
                                                : t("login.showPassword")
                                            }
                                            onClick={() => setShowPassword((prev) => !prev)}
                                            edge="end"
                                            sx={{
                                              transition: "transform 240ms ease",
                                              transform: showPassword
                                                ? "rotate(180deg)"
                                                : "rotate(0deg)",
                                            }}
                                          >
                                            {showPassword ? <VisibilityOff /> : <Visibility />}
                                          </IconButton>
                                        </Tooltip>
                                      </InputAdornment>
                                    ),
                                  },
                                }}
                              />
                            </Stack>
                          </Collapse>
                        )}

                        <Collapse in={Boolean(feedback)} timeout={260}>
                          <Alert severity={feedback?.severity || "info"}>
                            {feedback?.text || ""}
                          </Alert>
                        </Collapse>

                        <Button
                          type="submit"
                          variant="contained"
                          size="large"
                          fullWidth
                          disabled={submitting}
                          startIcon={
                            step === 2 && submitting ? (
                              <CircularProgress size={18} color="inherit" />
                            ) : null
                          }
                        >
                          {step === 1
                            ? t("login.next")
                            : submitting
                              ? t("login.submitting")
                              : t("login.submit")}
                        </Button>

                        <Collapse in={step === 2} timeout={320} unmountOnExit>
                          <Button
                            type="button"
                            variant="text"
                            fullWidth
                            onClick={() => {
                              setStepDir("right");
                              setStep(1);
                            }}
                            disabled={submitting}
                          >
                            {t("login.back")}
                          </Button>
                        </Collapse>
                      </Stack>
                    </Box>
                  </Box>
                </Fade>
              </Box>
            </Slide>
          </Box>

          <Typography variant="caption" component="p" color="text.secondary" align="left" sx={{ mt: 3 }}>
            {t("login.foot")}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

/* ────────────────────────────── 账户页 ────────────────────────────── */

const NAV_TREE = [
  { id: "activity", key: "nav.activity", icon: <CampaignOutlinedIcon /> },
  { id: "products", key: "nav.products", icon: <WidgetsOutlinedIcon /> },
  {
    id: "users",
    key: "nav.group.users",
    icon: <GroupOutlinedIcon />,
    items: [
      { id: "overview", key: "nav.overview", icon: <DashboardOutlinedIcon /> },
      { id: "codes", key: "nav.codes", icon: <VpnKeyOutlinedIcon /> },
      { id: "settings", key: "nav.settings", icon: <SettingsOutlinedIcon /> },
    ],
  },
];

const ALL_VIEWS = NAV_TREE.flatMap((node) => node.items ?? [node]);

function StatCard({ label, value, icon }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" color="text.secondary">
          {icon}
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
        </Stack>
        <Typography variant="h5" component="p" sx={{ mt: 1.5 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, subtitle, action, children }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          spacing={2}
          sx={{ mb: subtitle ? 0.5 : 2 }}
        >
          <Box>
            <Typography variant="h6" component="h2">
              {title}
            </Typography>
            {subtitle ? (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            ) : null}
          </Box>
          {action}
        </Stack>
        <Box sx={{ mt: 2 }}>{children}</Box>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ py: 1 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ wordBreak: "break-all", textAlign: "right" }}>
        {value}
      </Typography>
    </Stack>
  );
}

function PageHeader({ title, subtitle }) {
  return (
    <Box>
      <Typography variant="h5" component="h1">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {subtitle}
      </Typography>
    </Box>
  );
}

/** 活动事件类型 → 词条 key；未知类型统一落到 other 兜底。 */
const ACTIVITY_EVENT_TYPES = [
  "code.created",
  "code.redeemed",
  "code.revoked",
  "code.expired",
  "session.login",
];

function activityEventKey(type) {
  return ACTIVITY_EVENT_TYPES.includes(type) ? `activity.event.${type}` : "activity.event.other";
}

function fmtSize(bytes) {
  const total = Number(bytes ?? 0);
  if (!total) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = total;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${index === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function ActivityView() {
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    let alive = true;
    const token = readToken();
    request(`/api/activity?token=${encodeURIComponent(token)}`).then((result) => {
      if (!alive) return;
      if (!result.ok || !result.data) {
        setFailed(true);
        setLoading(false);
        return;
      }
      setStats(result.data.stats ?? null);
      setEvents(Array.isArray(result.data.events) ? result.data.events : []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Stack spacing={3}>
      <PageHeader title={t("activity.title")} subtitle={t("activity.subtitle")} />
      {loading ? (
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            {t("activity.loading")}
          </Typography>
        </Stack>
      ) : failed ? (
        <Alert severity="error">{t("activity.error")}</Alert>
      ) : (
        <Stack spacing={3}>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
            }}
          >
            <StatCard
              label={t("activity.stat.joined")}
              value={fmtDate(stats?.joinedAt, lang)}
              icon={<PersonOutlineIcon fontSize="small" />}
            />
            <StatCard
              label={t("activity.stat.webLogins")}
              value={stats?.webLogins ?? 0}
              icon={<DevicesOutlinedIcon fontSize="small" />}
            />
            <StatCard
              label={t("activity.stat.used")}
              value={stats?.codesUsed ?? 0}
              icon={<CheckCircleOutlineIcon fontSize="small" />}
            />
            <StatCard
              label={t("activity.stat.lastActive")}
              value={fmtDateTime(stats?.lastActiveAt, lang)}
              icon={<AutorenewOutlinedIcon fontSize="small" />}
            />
          </Box>

          <SectionCard title={t("activity.section.title")} subtitle={t("activity.section.subtitle")}>
            {events.length === 0 ? (
              <Alert severity="info">{t("activity.empty")}</Alert>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t("activity.col.time")}</TableCell>
                      <TableCell>{t("activity.col.event")}</TableCell>
                      <TableCell>{t("activity.col.detail")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {events.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDateTime(item.at, lang)}</TableCell>
                        <TableCell>
                          <Chip size="small" variant="outlined" label={t(activityEventKey(item.type))} />
                        </TableCell>
                        <TableCell sx={{ fontFamily: item.detail ? "monospace" : undefined }}>
                          {item.detail || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </SectionCard>
        </Stack>
      )}
    </Stack>
  );
}

function ProductsView() {
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    request("/api/products").then((result) => {
      if (!alive) return;
      if (!result.ok || !result.data) {
        setFailed(true);
        setLoading(false);
        return;
      }
      setItems(Array.isArray(result.data.items) ? result.data.items : []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Stack spacing={3}>
      <PageHeader title={t("products.title")} subtitle={t("products.subtitle")} />
      {loading ? (
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            {t("products.loading")}
          </Typography>
        </Stack>
      ) : failed ? (
        <Alert severity="error">{t("products.error")}</Alert>
      ) : (
        <SectionCard
          title={t("products.section.title")}
          subtitle={items.length ? t("products.section.subtitle") : undefined}
        >
          {items.length === 0 ? (
            <Alert severity="info">{t("products.empty")}</Alert>
          ) : (
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
              }}
            >
              {items.map((item) => (
                <Card variant="outlined" key={item.fileName}>
                  <CardContent>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", sm: "center" }}
                      spacing={2}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle1" component="p" sx={{ wordBreak: "break-all" }}>
                          {item.fileName}
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                          <Chip size="small" label={t(`platform.${item.platform}`)} />
                          <Typography variant="body2" color="text.secondary">
                            {fmtSize(item.size)} · {fmtDateTime(item.updatedAt, lang)}
                          </Typography>
                        </Stack>
                      </Box>
                      <Button
                        variant="contained"
                        startIcon={<DownloadOutlinedIcon />}
                        href={item.url}
                        download
                      >
                        {t("products.download")}
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </SectionCard>
      )}
    </Stack>
  );
}

function OverviewView({ user, codes, onCreate, creating, onCopy }) {
  const { t, lang } = useI18n();

  const stats = useMemo(() => {
    const pending = codes.filter((item) => item.status === "pending").length;
    const used = codes.filter((item) => item.status === "used").length;
    return { pending, total: codes.length, used };
  }, [codes]);

  const current = codes.find((item) => item.status === "pending") ?? null;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h1">
          {t("overview.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("overview.subtitle")}
        </Typography>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
        }}
      >
        <StatCard label={t("overview.pending")} value={stats.pending} icon={<VpnKeyOutlinedIcon fontSize="small" />} />
        <StatCard label={t("overview.total")} value={stats.total} icon={<AutorenewOutlinedIcon fontSize="small" />} />
        <StatCard label={t("overview.used")} value={stats.used} icon={<CheckCircleOutlineIcon fontSize="small" />} />
        <StatCard
          label={t("overview.joined")}
          value={fmtDate(user?.createdAt, lang)}
          icon={<PersonOutlineIcon fontSize="small" />}
        />
      </Box>

      <SectionCard
        title={t("current.title")}
        subtitle={current ? t("current.subtitle.has") : t("current.subtitle.none")}
        action={
          <Button
            variant="contained"
            onClick={onCreate}
            disabled={creating}
            startIcon={creating ? <CircularProgress size={18} color="inherit" /> : <AutorenewOutlinedIcon />}
          >
            {creating ? t("current.creating") : t("current.create")}
          </Button>
        }
      >
        {current ? (
          <Stack spacing={2}>
            <Paper
              variant="outlined"
              sx={{ py: 3, px: 2, display: "flex", justifyContent: "center", bgcolor: "action.hover" }}
            >
              <Typography
                variant="h4"
                component="p"
                sx={{
                  fontFamily: "monospace",
                  letterSpacing: { xs: 2, sm: 6 },
                  wordBreak: "break-all",
                  textAlign: "center",
                }}
              >
                {current.display || current.code}
              </Typography>
            </Paper>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" color="text.secondary">
                {t("current.expires", { time: fmtDateTime(current.expiresAt, lang) })}
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              <Button
                size="small"
                startIcon={<ContentCopyOutlinedIcon />}
                onClick={() => onCopy(current.display || current.code)}
              >
                {t("common.copy")}
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Alert severity="info">{t("current.empty")}</Alert>
        )}
      </SectionCard>

      <SectionCard title={t("quick.title")} subtitle={t("quick.subtitle")}>
        <List disablePadding>
          {["1", "2", "3"].map((step) => (
            <ListItemButton key={step} component="div" disableRipple>
              <ListItemIcon>
                <Avatar sx={{ width: 28, height: 28, fontSize: 14 }}>{step}</Avatar>
              </ListItemIcon>
              <ListItemText
                primary={t(`quick.step${step}.title`)}
                secondary={t(`quick.step${step}.desc`)}
              />
            </ListItemButton>
          ))}
        </List>
      </SectionCard>

      <SectionCard title={t("profile.title")}>
        <Stack divider={<Divider flexItem />}>
          <InfoRow label={t("profile.username")} value={user?.username ?? "—"} />
          <InfoRow label={t("profile.displayName")} value={user?.displayName ?? user?.username ?? "—"} />
          <InfoRow label={t("profile.joined")} value={fmtDateTime(user?.createdAt, lang)} />
        </Stack>
      </SectionCard>
    </Stack>
  );
}

function CodesView({ codes, onCreate, onRevoke, creating, revoking, onCopy }) {
  const { t, lang } = useI18n();

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-end" spacing={2}>
        <Box>
          <Typography variant="h5" component="h1">
            {t("codes.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("codes.subtitle")}
          </Typography>
        </Box>
        <Button
          variant="contained"
          onClick={onCreate}
          disabled={creating}
          startIcon={creating ? <CircularProgress size={18} color="inherit" /> : <AutorenewOutlinedIcon />}
        >
          {creating ? t("current.creating") : t("current.create")}
        </Button>
      </Stack>

      <TableContainer component={Paper} variant="outlined">
        <Table sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              <TableCell>{t("codes.col.code")}</TableCell>
              <TableCell>{t("codes.col.status")}</TableCell>
              <TableCell>{t("codes.col.created")}</TableCell>
              <TableCell>{t("codes.col.expires")}</TableCell>
              <TableCell align="right">{t("codes.col.actions")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {codes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                  <Typography variant="body2" color="text.secondary">
                    {t("codes.empty")}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              codes.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: "monospace", letterSpacing: 1 }}>
                      {item.display || item.code}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <StatusChip status={item.status} />
                  </TableCell>
                  <TableCell>{fmtDateTime(item.createdAt, lang)}</TableCell>
                  <TableCell>{fmtDateTime(item.expiresAt, lang)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <IconButton
                        size="small"
                        aria-label={t("common.copy")}
                        onClick={() => onCopy(item.display || item.code)}
                      >
                        <ContentCopyOutlinedIcon fontSize="small" />
                      </IconButton>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={item.status !== "pending" || revoking === item.id}
                        onClick={() => onRevoke(item)}
                      >
                        {t("codes.revoke")}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

function HelpView({ onLogout }) {
  const { t } = useI18n();

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h1">
          {t("help.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("help.subtitle")}
        </Typography>
      </Box>

      <SectionCard title={t("help.how")}>
        <Stack component="ol" spacing={1.5} sx={{ pl: 3, m: 0 }}>
          <Typography component="li" variant="body2">
            {t("help.how.1")}
          </Typography>
          <Typography component="li" variant="body2">
            {t("help.how.2")}
          </Typography>
          <Typography component="li" variant="body2">
            {t("help.how.3")}
          </Typography>
        </Stack>
      </SectionCard>

      <Alert severity="info" icon={<ShieldOutlinedIcon />}>
        <AlertTitle>{t("help.security")}</AlertTitle>
        {t("help.security.body")}
      </Alert>

      <SectionCard title={t("help.logout")}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
            {t("help.logout.desc")}
          </Typography>
          <Button variant="outlined" color="error" startIcon={<LogoutOutlinedIcon />} onClick={onLogout}>
            {t("help.logout.action")}
          </Button>
        </Stack>
      </SectionCard>
    </Stack>
  );
}

function ProfileCard({ user, onUserChange, notify }) {
  const { t } = useI18n();

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [nameValue, setNameValue] = useState(user?.displayName ?? "");
  const [nameBusy, setNameBusy] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const token = readToken();
    if (!token) return;
    setAvatarBusy(true);
    try {
      const avatar = await cropToSquareDataUrl(file);
      const result = await request("/api/profile/avatar", { method: "POST", body: { token, avatar } });
      if (result.ok && result.data?.user) {
        onUserChange(result.data.user);
        notify(t("profile.avatar.ok"));
      } else {
        notify(result.data?.message || t("profile.avatar.fail"));
      }
    } catch {
      notify(t("profile.avatar.fail"));
    } finally {
      setAvatarBusy(false);
    }
  };

  const openNameDialog = () => {
    setNameValue(user?.displayName ?? "");
    setNameOpen(true);
  };

  const handleNameSave = async () => {
    const displayName = nameValue.trim();
    if (displayName.length < 1 || displayName.length > 24) {
      notify(t("profile.name.invalid"));
      return;
    }
    const token = readToken();
    if (!token) return;
    setNameBusy(true);
    const result = await request("/api/profile/name", { method: "POST", body: { token, displayName } });
    setNameBusy(false);
    if (result.ok && result.data?.user) {
      onUserChange(result.data.user);
      setNameOpen(false);
      notify(t("profile.name.ok"));
    } else {
      notify(result.data?.message || t("profile.name.fail"));
    }
  };

  const handlePasswordSave = async () => {
    if (newPassword !== confirmPassword) {
      notify(t("profile.password.mismatch"));
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 72) {
      notify(t("profile.password.weak"));
      return;
    }
    const token = readToken();
    if (!token) return;
    setPwdBusy(true);
    const result = await request("/api/profile/password", {
      method: "POST",
      body: { token, oldPassword, newPassword },
    });
    setPwdBusy(false);
    if (result.ok) {
      setPwdOpen(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify(t("profile.password.ok"));
    } else {
      notify(result.data?.message || t("profile.password.fail"));
    }
  };

  return (
    <SectionCard title={t("profile.card.title")} subtitle={t("profile.card.subtitle")}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }}>
        <Avatar
          src={user?.avatar || undefined}
          sx={{ bgcolor: "primary.main", width: 72, height: 72, fontSize: 30 }}
        >
          {(user?.displayName || user?.username || "U").slice(0, 1).toUpperCase()}
        </Avatar>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h6" component="p">
            {user?.displayName || user?.username}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            @{user?.username}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }} useFlexGap>
          <Button component="label" variant="outlined" startIcon={<PhotoCameraOutlinedIcon />} disabled={avatarBusy}>
            {avatarBusy ? t("profile.avatar.busy") : t("profile.avatar.change")}
            <input type="file" accept="image/*" hidden onChange={handleAvatarChange} />
          </Button>
          <Button variant="outlined" startIcon={<DriveFileRenameOutlineOutlinedIcon />} onClick={openNameDialog}>
            {t("profile.name.change")}
          </Button>
          <Button variant="outlined" startIcon={<LockResetOutlinedIcon />} onClick={() => setPwdOpen(true)}>
            {t("profile.password.change")}
          </Button>
        </Stack>
      </Stack>

      <Dialog open={nameOpen} onClose={() => setNameOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("profile.name.title")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label={t("profile.name.label")}
            value={nameValue}
            onChange={(event) => setNameValue(event.target.value)}
            helperText={t("profile.name.hint")}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleNameSave();
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNameOpen(false)}>{t("profile.action.cancel")}</Button>
          <Button variant="contained" onClick={handleNameSave} disabled={nameBusy}>
            {nameBusy ? t("profile.action.saving") : t("profile.action.save")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={pwdOpen} onClose={() => setPwdOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("profile.password.title")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <TextField
              autoFocus
              fullWidth
              type="password"
              label={t("profile.password.old")}
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
            />
            <TextField
              fullWidth
              type="password"
              label={t("profile.password.new")}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <TextField
              fullWidth
              type="password"
              label={t("profile.password.confirm")}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handlePasswordSave();
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwdOpen(false)}>{t("profile.action.cancel")}</Button>
          <Button variant="contained" onClick={handlePasswordSave} disabled={pwdBusy}>
            {pwdBusy ? t("profile.action.saving") : t("profile.action.save")}
          </Button>
        </DialogActions>
      </Dialog>
    </SectionCard>
  );
}

function AccountPage() {
  const { t, lang } = useI18n();
  const [view, setView] = useState("activity");
  const [user, setUser] = useState(null);
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [created, setCreated] = useState(null);
  const [toast, setToast] = useState("");
  const [openGroups, setOpenGroups] = useState({ users: true });

  const isSmall = useMediaQuery((theme) => theme.breakpoints.down("md"));

  useEffect(() => {
    const token = readToken();
    if (!token) {
      window.location.replace("/login");
      return undefined;
    }
    let alive = true;
    (async () => {
      const session = await request(`/api/session?token=${encodeURIComponent(token)}`);
      if (!alive) return;
      if (!session.ok || !session.data?.user) {
        clearToken();
        window.location.replace("/login");
        return;
      }
      setUser(session.data.user);
      const list = await request(`/api/login-code?token=${encodeURIComponent(token)}`);
      if (!alive) return;
      if (list.ok && Array.isArray(list.data?.codes)) setCodes(list.data.codes);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const refreshCodes = useCallback(async () => {
    const token = readToken();
    if (!token) return;
    const list = await request(`/api/login-code?token=${encodeURIComponent(token)}`);
    if (list.ok && Array.isArray(list.data?.codes)) setCodes(list.data.codes);
  }, []);

  const handleCreate = useCallback(async () => {
    const token = readToken();
    if (!token || creating) return;
    setCreating(true);
    const result = await request("/api/login-code", { method: "POST", body: { token } });
    setCreating(false);
    if (result.ok && result.data?.code) {
      setCreated(result.data.code);
      await refreshCodes();
    } else {
      setToast(result.data?.message || t("codes.createFail"));
    }
  }, [creating, refreshCodes, t]);

  const handleRevoke = useCallback(
    async (item) => {
      const token = readToken();
      if (!token) return;
      setRevoking(item.id);
      const result = await request("/api/login-code/revoke", {
        method: "POST",
        body: { token, id: item.id },
      });
      setRevoking("");
      setToast(result.ok ? t("codes.revoked") : result.data?.message || t("codes.revokeFail"));
      await refreshCodes();
    },
    [refreshCodes, t],
  );

  const handleLogout = useCallback(async () => {
    const token = readToken();
    if (token) await request("/api/logout", { method: "POST", body: { token } });
    clearToken();
    window.location.replace("/login");
  }, []);

  const handleCopy = useCallback(
    async (text) => {
      const ok = await copyText(text);
      setToast(ok ? t("common.copied") : t("common.copyFail"));
    },
    [t],
  );

  const drawer = (
    <Box role="navigation">
      <Toolbar>
        <Avatar sx={{ bgcolor: "primary.main", width: 32, height: 32, mr: 2, fontSize: 16 }}>T</Avatar>
        <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
          {t("app.name")}
        </Typography>
      </Toolbar>
      <Divider />
      <List component="nav" disablePadding>
        {NAV_TREE.map((node) => {
          // 单页节点：活动、产品
          if (!node.items) {
            return (
              <ListItemButton
                key={node.id}
                selected={view === node.id}
                onClick={() => {
                  setView(node.id);
                  setMobileOpen(false);
                }}
              >
                <ListItemIcon>{node.icon}</ListItemIcon>
                <ListItemText primary={t(node.key)} />
              </ListItemButton>
            );
          }
          const open = openGroups[node.id] !== false;
          return (
            <Box key={node.id}>
              {/* 文件夹节点：点击展开/收起其中的页面 */}
              <ListItemButton
                onClick={() => setOpenGroups((prev) => ({ ...prev, [node.id]: !open }))}
                aria-expanded={open}
              >
                <ListItemIcon>
                  {node.icon || (open ? <FolderOpenOutlinedIcon /> : <FolderOutlinedIcon />)}
                </ListItemIcon>
                <ListItemText primary={t(node.key)} />
                {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
              </ListItemButton>
              <Collapse in={open} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {node.items.map((item) => (
                    <ListItemButton
                      key={item.id}
                      sx={{ pl: 4 }}
                      selected={view === item.id}
                      onClick={() => {
                        setView(item.id);
                        setMobileOpen(false);
                      }}
                    >
                      <ListItemIcon>{item.icon}</ListItemIcon>
                      <ListItemText primary={t(item.key)} />
                    </ListItemButton>
                  ))}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </List>
    </Box>
  );

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.default",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }} elevation={0} color="inherit">
        <Toolbar>
          {isSmall ? (
            <IconButton
              color="inherit"
              edge="start"
              aria-label={t("nav.open")}
              onClick={() => setMobileOpen(true)}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          ) : null}
          <Box sx={{ flexGrow: 1, display: "flex", alignItems: "center", minWidth: 0 }}>
            <Box
              component="img"
              src="/assets/logo.svg"
              alt="Turber"
              sx={{ height: 30, width: "auto", display: "block", flexShrink: 0 }}
            />
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <LanguageSwitcher />
            <Avatar
              src={user?.avatar || undefined}
              sx={{ width: 28, height: 28, bgcolor: "primary.main", fontSize: 14 }}
            >
              {(user?.displayName || user?.username || "U").slice(0, 1).toUpperCase()}
            </Avatar>
            <Typography variant="body2" sx={{ display: { xs: "none", sm: "block" } }}>
              {user?.displayName || user?.username}
            </Typography>
            <Tooltip title={t("nav.logout")}>
              <IconButton color="inherit" aria-label={t("nav.logout")} onClick={handleLogout}>
                <LogoutOutlinedIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        {isSmall ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ "& .MuiDrawer-paper": { width: DRAWER_WIDTH } }}
          >
            {drawer}
          </Drawer>
        ) : (
          <Drawer
            variant="permanent"
            open
            sx={{ "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" } }}
          >
            {drawer}
          </Drawer>
        )}
      </Box>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        <Toolbar />
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
          {view === "settings" ? (
            <Stack spacing={3}>
              <Box>
                <Typography variant="h5" component="h1">
                  {t("settings.title")}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t("settings.subtitle")}
                </Typography>
              </Box>
              <ProfileCard user={user} onUserChange={setUser} notify={setToast} />
            </Stack>
          ) : null}
          {view === "overview" ? (
            <OverviewView user={user} codes={codes} onCreate={handleCreate} creating={creating} onCopy={handleCopy} />
          ) : null}
          {view === "codes" ? (
            <CodesView
              codes={codes}
              onCreate={handleCreate}
              onRevoke={handleRevoke}
              creating={creating}
              revoking={revoking}
              onCopy={handleCopy}
            />
          ) : null}
          {view === "activity" ? <ActivityView /> : null}
          {view === "products" ? <ProductsView /> : null}
        </Box>
      </Box>

      <Dialog open={Boolean(created)} onClose={() => setCreated(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t("dialog.title")}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{t("dialog.desc")}</DialogContentText>
          <Paper variant="outlined" sx={{ py: 2.5, px: 2, bgcolor: "action.hover" }}>
            <Typography
              variant="h5"
              component="p"
              align="center"
              sx={{ fontFamily: "monospace", letterSpacing: 2, wordBreak: "break-all" }}
            >
              {created?.display || created?.code}
            </Typography>
          </Paper>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
            {t("dialog.expires", { time: fmtDateTime(created?.expiresAt, lang) })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => handleCopy(created?.display || created?.code || "")}
            startIcon={<ContentCopyOutlinedIcon />}
          >
            {t("common.copy")}
          </Button>
          <Button variant="contained" onClick={() => setCreated(null)}>
            {t("common.know")}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={2400}
        onClose={() => setToast("")}
        message={toast}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}

/* ────────────────────────────── 挂载 ────────────────────────────── */

function Root() {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [lang, setLangState] = useState(detectLanguage);
  const page = window.__TURBER_PAGE__ === "account" ? "account" : "login";

  const theme = useMemo(
    () => createTheme({ palette: { mode: prefersDark ? "dark" : "light" } }),
    [prefersDark],
  );

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);

  const setLang = useCallback((next) => {
    if (!next) return;
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* 忽略 */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title =
      page === "account"
        ? `${translate(lang, "app.account")} · ${translate(lang, "app.name")}`
        : `${translate(lang, "login.title")} · ${translate(lang, "app.name")}`;
  }, [lang, page]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return (
    <I18nContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {page === "account" ? <AccountPage /> : <LoginPage />}
      </ThemeProvider>
    </I18nContext.Provider>
  );
}

createRoot(document.getElementById("root")).render(<Root />);