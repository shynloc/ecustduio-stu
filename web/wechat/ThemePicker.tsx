import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Palette,
  Search,
  SlidersHorizontal,
  Star,
  X,
  LayoutTemplate,
  LoaderCircle,
} from "lucide-react";
import { api, post, put } from "../api";
import {
  wechatThemeCatalog,
  wechatRecipes,
  recipeDescriptions,
  type WechatFormat,
} from "../../shared/wechat-themes";
import "./wechat-studio.css";

type Choice = { palette: string; format?: WechatFormat };
type Props = {
  articleId: string;
  revision: number;
  initial: Choice;
  onApply: (value: Choice) => void;
  onClose: () => void;
};
export function ThemePicker({
  articleId,
  revision,
  initial,
  onApply,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null),
    returnFocus = useRef(document.activeElement as HTMLElement);
  const [choice, setChoice] = useState<Choice>({
      palette: initial.palette,
      format: { ...initial.format },
    }),
    [tab, setTab] = useState("themes"),
    [expanded, setExpanded] = useState(false),
    [query, setQuery] = useState(""),
    [collection, setCollection] = useState("all"),
    [mode, setMode] = useState("all"),
    [mobilePreview, setMobilePreview] = useState(false);
  const [html, setHtml] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [prefs, setPrefs] = useState<{ favorites: string[]; recent: string[] }>(
      { favorites: [], recent: [] },
    ),
    [prefsReady, setPrefsReady] = useState(false),
    [savingPrefs, setSavingPrefs] = useState(false),
    [prefError, setPrefError] = useState("");
  useEffect(() => {
    let live = true;
    api("/workspace/preferences/wechat-theme-library")
      .then((r) => {
        if (live) {
          setPrefs(r.value || { favorites: [], recent: [] });
          setPrefsReady(true);
        }
      })
      .catch(() => {
        if (live) setPrefError("收藏记录暂时无法读取，仍可选择和应用主题。");
      });
    return () => {
      live = false;
    };
  }, []);
  const selected =
    wechatThemeCatalog.find((x) => x.id === choice.palette) ||
    wechatThemeCatalog[0];
  const favorites = Array.isArray(prefs.favorites) ? prefs.favorites : [],
    recent = Array.isArray(prefs.recent) ? prefs.recent : [];
  useEffect(() => {
    dialog.current?.showModal();
    return () => returnFocus.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () =>
        post("/wechat/manuscripts/" + articleId + "/layout-preview", {
          revision,
          palette: choice.palette,
          format: choice.format || {},
        })
          .then((r) => {
            if (live) {
              setHtml(r.previewHtml);
              setLoading(false);
            }
          })
          .catch((e) => {
            if (live) {
              setError(e.message);
              setLoading(false);
            }
          }),
      160,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [choice, revision, articleId, retry]);
  const recommended = [
    ...new Set([initial.palette, "acks-gold", "acks-song-ink", "acks-dark"]),
  ].slice(0, 3);
  const filtered = wechatThemeCatalog
    .filter(
      (t) =>
        (expanded || recommended.includes(t.id)) &&
        (!expanded ||
          ((collection === "all" ||
            collection === t.collection ||
            (collection === "favorite" && favorites.includes(t.id)) ||
            (collection === "recent" && recent.includes(t.id))) &&
            (mode === "all" || mode === t.mode) &&
            (!query.trim() ||
              (t.name + " " + t.description)
                .toLowerCase()
                .includes(query.trim().toLowerCase())))),
    )
    .sort((a, b) =>
      collection === "recent" ? recent.indexOf(a.id) - recent.indexOf(b.id) : 0,
    );
  function format(patch: WechatFormat) {
    setChoice((c) => ({ ...c, format: { ...c.format, ...patch } }));
  }
  async function savePrefs(value: { favorites: string[]; recent: string[] }) {
    setSavingPrefs(true);
    setPrefError("");
    try {
      await put("/workspace/preferences/wechat-theme-library", { value });
      setPrefs(value);
    } finally {
      setSavingPrefs(false);
    }
  }
  async function apply() {
    if (loading || error || savingPrefs) return;
    if (prefsReady) {
      try {
        await savePrefs({
          ...prefs,
          recent: [
            choice.palette,
            ...recent.filter((x) => x !== choice.palette),
          ].slice(0, 12),
        });
      } catch {
        /* Article application must remain available if optional history is offline. */
      }
    }
    onApply(choice);
  }
  function radioKeys(e: React.KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
      return;
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]"),
    );
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const next =
      items[
        (at +
          (["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1) +
          items.length) %
          items.length
      ];
    next?.focus();
    next?.click();
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="article-theme-dialog"
      aria-labelledby="article-theme-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="article-theme-header">
        <div>
          <Palette size={20} />
          <h2 id="article-theme-title">文章排版</h2>
          <span>先预览，喜欢再应用</span>
        </div>
        <button
          className="article-mobile-preview"
          onClick={() => setMobilePreview(!mobilePreview)}
        >
          <Eye size={17} />
          {mobilePreview ? "返回选主题" : "看文章效果"}
        </button>
        <button
          className="icon-btn"
          aria-label="取消选择主题"
          title="取消"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="article-theme-body" data-mobile-preview={mobilePreview}>
        <section
          className="article-theme-preview"
          aria-label="当前文章排版预览"
        >
          <div className="article-preview-label">
            <span>公众号排版效果</span>
            <strong>{selected.name}</strong>
          </div>
          <div className="article-preview-paper">
            <iframe
              title="主题试用预览"
              sandbox=""
              srcDoc={html}
              aria-busy={loading}
            />
            {loading && (
              <div className="article-preview-loading" role="status">
                <LoaderCircle className="spin" size={20} />
                正在排版…
              </div>
            )}
          </div>
          {error && (
            <p className="article-theme-error" role="alert">
              {error}
              <button onClick={() => setRetry((x) => x + 1)}>重试预览</button>
            </p>
          )}
        </section>
        <section className="article-theme-chooser">
          <div
            className="article-theme-tabs"
            role="tablist"
            aria-label="排版类别"
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
              e.preventDefault();
              const keys = ["themes", "recipes", "tweaks"],
                next =
                  keys[
                    (keys.indexOf(tab) + (e.key === "ArrowRight" ? 1 : 2)) % 3
                  ];
              setTab(next);
              dialog.current
                ?.querySelector<HTMLButtonElement>("#article-tab-" + next)
                ?.focus();
            }}
          >
            {[
              ["themes", "主题", Palette],
              ["recipes", "配方", LayoutTemplate],
              ["tweaks", "微调", SlidersHorizontal],
            ].map(([id, label, Icon]: any) => (
              <button
                id={"article-tab-" + id}
                key={id}
                role="tab"
                aria-controls={"article-panel-" + id}
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          <div
            className="article-theme-scroll"
            id={"article-panel-" + tab}
            role="tabpanel"
            aria-labelledby={"article-tab-" + tab}
          >
            {tab === "themes" && (
              <>
                <div className="article-theme-count">
                  <strong>文章主题</strong>
                  <span>共 {wechatThemeCatalog.length} 款</span>
                </div>
                <p className="article-theme-help">
                  43 款 ACKS 模板，另保留 3 款原有主题。
                </p>
                {expanded && (
                  <>
                    <label className="article-theme-search">
                      <Search size={16} />
                      <input
                        type="search"
                        aria-label="搜索文章主题"
                        placeholder="搜索主题名称"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <div className="article-theme-filters">
                      <label>
                        主题系列
                        <select
                          aria-label="主题系列"
                          value={collection}
                          onChange={(e) => setCollection(e.target.value)}
                        >
                          <option value="all">全部系列</option>
                          <option value="recent">最近使用</option>
                          <option value="favorite">收藏主题</option>
                          <option value="acks">ACKS · 19 款</option>
                          <option value="milestone">Milestone · 24 款</option>
                          <option value="legacy">原有主题 · 3 款</option>
                        </select>
                      </label>
                      <label>
                        明暗风格
                        <select
                          aria-label="明暗风格"
                          value={mode}
                          onChange={(e) => setMode(e.target.value)}
                        >
                          <option value="all">全部明暗</option>
                          <option value="light">浅色</option>
                          <option value="dark">深色</option>
                        </select>
                      </label>
                    </div>
                  </>
                )}
                <div
                  className="article-theme-grid"
                  role="radiogroup"
                  aria-label="文章主题"
                  onKeyDown={radioKeys}
                >
                  {filtered.map((t) => (
                    <button
                      role="radio"
                      aria-checked={choice.palette === t.id}
                      aria-label={"预览主题 " + t.name}
                      title={t.description}
                      key={t.id}
                      className="article-theme-card"
                      onClick={() =>
                        setChoice((c) => ({ ...c, palette: t.id }))
                      }
                    >
                      <div
                        className="article-theme-thumb"
                        style={{ background: t.bg }}
                      >
                        <img
                          src={"/wechat-themes/" + t.id + "-preview.png"}
                          alt=""
                          loading="lazy"
                        />
                        {choice.palette === t.id && (
                          <span className="article-theme-check">
                            <Check size={13} />
                          </span>
                        )}
                      </div>
                      <strong>{t.name}</strong>
                      <small>
                        {t.collection === "legacy"
                          ? "原有主题"
                          : t.collection === "acks"
                            ? "ACKS"
                            : "Milestone"}
                      </small>
                    </button>
                  ))}
                </div>
                {!filtered.length && (
                  <div className="article-theme-empty">
                    没有匹配的主题。
                    <button
                      onClick={() => {
                        setQuery("");
                        setCollection("all");
                        setMode("all");
                      }}
                    >
                      查看全部主题
                    </button>
                  </div>
                )}
                <button
                  className="article-theme-expand"
                  aria-expanded={expanded}
                  onClick={() => {
                    setExpanded(!expanded);
                    setQuery("");
                    setCollection("all");
                    setMode("all");
                  }}
                >
                  {expanded ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}{" "}
                  {expanded
                    ? "收起全部主题"
                    : "查看全部主题（" + wechatThemeCatalog.length + " 款）"}
                </button>
              </>
            )}
            {tab === "recipes" && (
              <>
                <p className="article-theme-help">
                  配方调整文章结构，保留主题配色。
                </p>
                <div
                  className="article-recipe-list"
                  role="radiogroup"
                  aria-label="排版配方"
                  onKeyDown={radioKeys}
                >
                  {Object.entries(wechatRecipes).map(([id, r]) => (
                    <button
                      key={id}
                      role="radio"
                      aria-checked={(choice.format?.recipe || "default") === id}
                      onClick={() => format({ recipe: id as any })}
                    >
                      <div>
                        <strong>{r.name}</strong>
                        <small>{recipeDescriptions[id]}</small>
                      </div>
                      {(choice.format?.recipe || "default") === id && (
                        <Check size={18} />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
            {tab === "tweaks" && (
              <div className="article-theme-tweaks">
                <p className="article-theme-help">
                  仅调整当前文章，不改变工作台界面。
                </p>
                <label>
                  正文字号
                  <select
                    aria-label="正文字号"
                    value={choice.format?.size || ""}
                    onChange={(e) =>
                      format({
                        size: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  >
                    <option value="">跟随主题（{selected.bodySize}px）</option>
                    {[14, 15, 16, 17, 18, 20].map((n) => (
                      <option key={n} value={n}>
                        {n} px
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  正文行距
                  <select
                    aria-label="正文行距"
                    value={choice.format?.lineHeight || ""}
                    onChange={(e) =>
                      format({
                        lineHeight: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  >
                    <option value="">跟随主题（{selected.lineHeight}）</option>
                    {[1.5, 1.6, 1.8, 1.85, 1.9, 2, 2.2].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="article-tweak-check">
                  <input
                    type="checkbox"
                    aria-label="首行缩进"
                    checked={
                      choice.format?.indent ??
                      (
                        wechatRecipes[choice.format?.recipe || "default"]
                          .overrides as any
                      ).paraIndent ??
                      selected.paraIndent
                    }
                    onChange={(e) => format({ indent: e.target.checked })}
                  />
                  首行缩进
                </label>
                <label className="article-tweak-check">
                  <input
                    type="checkbox"
                    aria-label="显示主题装饰"
                    checked={choice.format?.decorations !== false}
                    onChange={(e) => format({ decorations: e.target.checked })}
                  />
                  显示主题装饰
                </label>
                <button
                  className="btn secondary"
                  onClick={() => setChoice((c) => ({ ...c, format: {} }))}
                >
                  恢复主题默认排版
                </button>
                <p className="article-theme-help">
                  主题装饰已转为兼容图片。中式竖排会转成适合公众号阅读的横排。
                </p>
              </div>
            )}
          </div>
          <footer className="article-theme-footer">
            {prefError && (
              <p role="alert" className="article-theme-error">
                {prefError}
              </p>
            )}
            <div className="article-theme-selection" role="status">
              {loading ? "正在更新预览…" : "已预览「" + selected.name + "」"}
            </div>
            <div>
              <button
                className="btn"
                disabled={loading || !!error || savingPrefs}
                onClick={apply}
              >
                <Check size={17} />
                应用排版
              </button>
              <button
                className="btn secondary"
                disabled={!prefsReady || savingPrefs}
                aria-label="收藏当前主题"
                aria-pressed={favorites.includes(choice.palette)}
                onClick={() =>
                  void savePrefs({
                    ...prefs,
                    favorites: favorites.includes(choice.palette)
                      ? favorites.filter((x) => x !== choice.palette)
                      : [...favorites, choice.palette],
                  }).catch(() =>
                    setPrefError("收藏暂未保存，请检查连接后重试。"),
                  )
                }
              >
                <Star
                  size={17}
                  fill={
                    favorites.includes(choice.palette) ? "currentColor" : "none"
                  }
                />
                {favorites.includes(choice.palette) ? "已收藏" : "收藏"}
              </button>
              <button className="text-link" onClick={onClose}>
                取消
              </button>
            </div>
          </footer>
        </section>
      </div>
    </dialog>,
    document.body,
  );
}
