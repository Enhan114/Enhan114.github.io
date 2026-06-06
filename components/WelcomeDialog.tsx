import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isFirstVisit, markVisited } from "../services/firstVisit";

const WelcomeDialog: React.FC = () => {
  const [show, setShow] = useState(false);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<"extension" | "done">("extension");

  useEffect(() => {
    if (isFirstVisit()) {
      setShow(true);
      requestAnimationFrame(() => setVisible(true));
    }
  }, []);

  const handleClose = useCallback(() => {
    markVisited();
    setVisible(false);
    setTimeout(() => setShow(false), 300);
  }, []);

  if (!show) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center px-4 select-none font-sans">
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-md transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={handleClose}
      />
      <div
        className={`relative w-full max-w-md bg-black/50 backdrop-blur-3xl saturate-150 border border-white/10 rounded-[28px] shadow-[0_30px_80px_rgba(0,0,0,0.5)] text-white p-6 transition-all duration-300 ${visible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"}`}
      >
        {/* Header */}
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">🎵</div>
          <h2 className="text-xl font-bold tracking-tight">欢迎使用 Aura Music</h2>
          <p className="text-white/40 text-sm mt-1">首次使用，建议完成以下设置</p>
        </div>

        {/* Extension recommendation */}
        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl shrink-0">🧩</span>
            <div>
              <h3 className="text-sm font-semibold text-white/80">安装浏览器扩展</h3>
              <p className="text-xs text-white/40 mt-1 leading-relaxed">
                安装 Aura Music Control 扩展后，可在游戏全屏或浏览器最小化时用键盘媒体键控制播放（上一首/播放暂停/下一首），无需切换窗口。
              </p>
              <p className="text-xs text-white/25 mt-2 leading-relaxed">
                扩展文件夹：<code className="bg-white/10 px-1.5 py-0.5 rounded text-white/50">c:\Web Music\ext</code>
              </p>
              <a
                href="https://support.microsoft.com/zh-cn/microsoft-edge/%E5%9C%A8-microsoft-edge-%E4%B8%AD%E6%B7%BB%E5%8A%A0%E3%80%81%E5%85%B3%E9%97%AD%E6%88%96%E5%88%A0%E9%99%A4%E6%89%A9%E5%B1%95-9c0ec68c-5f75-49d5-bb7e-483bd2ecac4c"
                target="_blank"
                rel="noopener"
                className="inline-block mt-2 text-xs text-blue-400/70 hover:text-blue-400 transition-colors"
              >
                如何安装扩展？→
              </a>
            </div>
          </div>
        </div>

        {/* Note about local files */}
        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 mb-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl shrink-0">💿</span>
            <div>
              <h3 className="text-sm font-semibold text-white/80">本地歌曲云端匹配</h3>
              <p className="text-xs text-white/40 mt-1 leading-relaxed">
                你的本地歌曲会自动匹配网易云和 TTML 数据库，获取逐字精准歌词。部分歌曲可能需要等待首次匹配完成后缓存。
              </p>
            </div>
          </div>
        </div>

        {/* Action button */}
        <button
          onClick={handleClose}
          className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white/80 font-medium transition-all text-sm"
        >
          知道了，开始使用
        </button>
      </div>
    </div>,
    document.body,
  );
};

export default WelcomeDialog;
