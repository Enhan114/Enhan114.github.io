import * as React from "react";
const { useState } = React;
import { createPortal } from "react-dom";
import { useI18n } from "../hooks/useI18n";
import { LinkIcon } from "./Icons";

export interface ImportResultItem {
  url: string;
  status: "success" | "failed";
  message?: string;
}

export const parseImportUrls = (input: string): string[] => {
  return input
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
};

export const buildImportResults = async (
  input: string,
  onImport: (url: string) => Promise<boolean>,
): Promise<ImportResultItem[]> => {
  const urls = parseImportUrls(input);
  const results: ImportResultItem[] = [];

  for (const url of urls) {
    try {
      const success = await onImport(url);
      results.push({
        url,
        status: success ? "success" : "failed",
        message: success ? undefined : "Import failed",
      });
    } catch (error) {
      results.push({
        url,
        status: "failed",
        message:
          error instanceof Error ? error.message : "Import failed",
      });
    }
  }

  return results;
};

interface ImportMusicDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (url: string) => Promise<boolean>;
}

const ImportMusicDialog: React.FC<ImportMusicDialogProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const { dict } = useI18n();
  const [importUrl, setImportUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [importResults, setImportResults] = useState<ImportResultItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleImport = async (input?: string) => {
    const rawInput = input ?? importUrl;
    if (!rawInput.trim() || isLoading) return;

    setIsLoading(true);
    try {
      const results = await buildImportResults(rawInput, onImport);
      setImportResults(results);
      const anySuccess = results.some((item) => item.status === "success");
      if (anySuccess) {
        setImportUrl("");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportClick = async () => {
    await handleImport();
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    const items = event.dataTransfer.items
      ? Array.from(event.dataTransfer.items)
      : [];
    const fileItem = items.find(
      (item): item is DataTransferItem => item.kind === "file",
    );

    if (fileItem) {
      const file = fileItem.getAsFile();
      if (!file) return;

      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "txt" || ext === "lrc" || ext === "json") {
        const text = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string) || "");
          reader.readAsText(file);
        });
        setImportUrl(text);
        await handleImport(text);
      }
    } else {
      const text = event.dataTransfer.getData("text/plain");
      if (text) {
        setImportUrl(text);
      }
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleClose = () => {
    setImportUrl("");
    setImportResults([]);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"></div>

      {/* Modal */}
      <div
        className="relative w-full max-w-[360px] bg-black/20 backdrop-blur-[80px] saturate-150 border border-white/10 rounded-[28px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 scale-100 ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Content */}
        <div className="p-6 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
            <LinkIcon className="w-7 h-7" />
          </div>

          <h3 className="text-xl font-bold text-white tracking-tight">
            {dict.import.title}
          </h3>
          <p className="text-white/60 text-[15px] mt-2 leading-relaxed px-2">
            {dict.import.hintStart}{" "}
            <span className="text-white/90 font-medium">
              {dict.import.hintBrand}
            </span>{" "}
            {dict.import.hintEnd}
          </p>

          <div
            className={`w-full mt-5 bg-white/10 border rounded-xl px-4 py-3.5 transition-all ${isDragOver ? "border-blue-400 bg-white/15" : "border-white/10"}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <textarea
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder={dict.import.placeholder + "（支持多行或逗号分隔多链接，或拖入链接文本文件）"}
              className="w-full min-h-[120px] bg-transparent text-white placeholder:text-white/20 focus:outline-none resize-y"
              disabled={isLoading}
              autoFocus
            />
          </div>
          <p className="mt-3 text-xs text-white/50 text-left">
            拖拽 `.txt`、`.lrc`、`.json` 文件到此处以导入链接。
          </p>
          {importResults.length > 0 ? (
            <div className="w-full mt-4 text-left space-y-2">
              <div className="text-sm font-medium text-white">导入结果：</div>
              {importResults.map((item) => (
                <div
                  key={item.url}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="break-all">{item.url}</span>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-semibold ${item.status === "success"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-red-500/15 text-red-300"
                      }`}
                    >
                      {item.status === "success" ? "成功" : "失败"}
                    </span>
                  </div>
                  {item.message ? (
                    <div className="mt-1 text-[13px] text-white/60">{item.message}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Action Buttons (iOS Style) */}
        <div className="grid grid-cols-2 border-t border-white/10 divide-x divide-white/10 bg-white/5">
          <button
            onClick={handleClose}
            className="py-4 text-[17px] text-white/60 font-medium hover:bg-white/5 transition-colors active:bg-white/10"
          >
            {dict.import.cancel}
          </button>
          <button
            onClick={handleImportClick}
            disabled={isLoading}
            className={`py-4 text-[17px] font-semibold transition-colors flex items-center justify-center gap-2 ${isLoading
                ? "text-white/40 cursor-not-allowed"
                : "text-blue-400 hover:bg-white/5 active:bg-white/10"
              }`}
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>{dict.import.loading}</span>
              </>
            ) : (
              dict.import.action
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ImportMusicDialog;
