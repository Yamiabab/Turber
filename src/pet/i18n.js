export const STRINGS = {
  zh: {
    minimize: '最小化',
    maximize: '最大化',
    restore: '还原',
    close: '关闭',
    menu: '菜单',
    settings: '设置',
    control: '控制面板',
    settingsTitle: '设置',
    language: '语言',
    chinese: '中文',
    english: 'English',
    done: '完成',
    provider: '供应商',
    modelApi: '模型 API',
    apiKey: 'API',
    apiKeyHint: '填入该供应商的 API Key，仅保存在本机',
    apiKeyPlaceholder: 'sk-...',
    apiBase: '接口地址',
    model: '模型',
    custom: '自定义',
    show: '显示',
    hide: '隐藏',
    save: '保存',
    saved: '已保存',
    saveFailed: '保存失败',
    listeningHint: '正在聆听唤醒词',
    triggeredHint: '已听见唤醒词',
    errorHint: '语音唤醒未启用',
    offHint: '语音唤醒未启动',
    chatTitle: '对话',
    chatHint: '说句话就会自动发送，也可以直接在这里输入。'
  },
  en: {
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close',
    menu: 'Menu',
    settings: 'Settings',
    control: 'Control panel',
    settingsTitle: 'Settings',
    language: 'Language',
    chinese: '中文',
    english: 'English',
    done: 'Done',
    provider: 'Provider',
    modelApi: 'Model API',
    apiKey: 'API',
    apiKeyHint: 'Paste the API key for this provider. Stored on this device only.',
    apiKeyPlaceholder: 'sk-...',
    apiBase: 'Base URL',
    model: 'Model',
    custom: 'Custom',
    show: 'Show',
    hide: 'Hide',
    save: 'Save',
    saved: 'Saved',
    saveFailed: 'Save failed',
    listeningHint: 'Listening for wake word',
    triggeredHint: 'Wake word detected',
    errorHint: 'Voice wake is unavailable',
    offHint: 'Voice wake is off',
    chatTitle: 'Chat',
    chatHint: 'Just speak and it sends automatically. Or type here.'
  }
};

export const LANG_LIST = ['zh', 'en'];

export const detectLang = () => {
  try {
    const saved = window.localStorage.getItem('mino.lang');
    if (saved && STRINGS[saved]) return saved;
  } catch {}
  const nav = (typeof navigator !== 'undefined' ? navigator.language || '' : '').toLowerCase();
  return nav.startsWith('zh') ? 'zh' : 'en';
};

export const voiceHint = (t, voice) => {
  if (voice === 'listening') return t.listeningHint;
  if (voice === 'triggered') return t.triggeredHint;
  if (voice === 'error') return t.errorHint;
  return t.offHint;
};
