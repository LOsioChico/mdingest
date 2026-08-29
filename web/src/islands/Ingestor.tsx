import { useState, useCallback, useRef, useEffect } from 'react';
import { Loader2, Copy, Check, Download, AlertCircle, ArrowRight, ChevronRight } from 'lucide-react';
import { PROVIDERS, detectProvider, type ProviderId } from '@shared/providers.ts';

type Format = 'md' | 'json';

interface ArticleMetadata {
  title?: string;
  author?: string;
  published?: string;
  updated?: string;
  reading_time?: string;
  tags?: string[];
  cover_image?: string;
}

interface IngestResult {
  metadata: ArticleMetadata;
  markdown: string;
}

interface ApiError {
  code: string;
  message: string;
  traceId?: string;
  details?: Array<{ path: string; message: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  'VALIDATION.FAILED': 'That URL doesn\'t match the expected format.',
  'SUBSTACK.PAID_POST': 'This post is behind a paywall. Only free posts can be ingested.',
  'MEDIUM.FREEDIUM_UNAVAILABLE': 'Freedium mirror is down or timed out. Try again in a moment.',
  'MEDIUM.INVALID_URL': 'This URL doesn\'t look like a Medium article.',
  'DEVTO.INVALID_URL': 'This URL doesn\'t look like a Dev.to article.',
  'SUBSTACK.INVALID_URL': 'This URL doesn\'t look like a Substack article.',
  'DEVTO.UNAVAILABLE': 'Dev.to API is unavailable. Try again in a moment.',
  'SUBSTACK.UNAVAILABLE': 'Substack API is unavailable. Try again in a moment.',
  'MEDIUM.PARSE_FAILED': 'Could not parse the article data. Try again.',
  'DEVTO.PARSE_FAILED': 'Could not parse the article data. Try again.',
  'SUBSTACK.PARSE_FAILED': 'Could not parse the article data. Try again.',
  'INTERNAL.ERROR': 'Something went wrong. Try again.',
};

export default function Ingestor() {
  const [url, setUrl] = useState('');
  const [provider, setProvider] = useState<ProviderId>('medium');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<Format>('md');
  const [errorVisible, setErrorVisible] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fade-in error when set — defer to next frame so browser sees opacity:0 first
  useEffect(() => {
    if (error) {
      const id = requestAnimationFrame(() => setErrorVisible(true));
      return () => cancelAnimationFrame(id);
    }
  }, [error]);

  // Fade-in result when set — defer to next frame so browser sees opacity:0 first
  useEffect(() => {
    if (result) {
      const id = requestAnimationFrame(() => setResultVisible(true));
      return () => cancelAnimationFrame(id);
    }
  }, [result]);

  const dismissError = useCallback(() => {
    setErrorVisible(false);
    setTimeout(() => setError(null), 200);
  }, []);

  const dismissResult = useCallback(() => {
    setResultVisible(false);
    setTimeout(() => setResult(null), 200);
  }, []);

  const handleUrlChange = useCallback((value: string) => {
    setUrl(value);
    const detected = detectProvider(value);
    if (detected) setProvider(detected);
    if (error) dismissError();
  }, [error, dismissError]);

  const handleIngest = useCallback(async () => {
    if (!url.trim()) return;
    if (!/^https?:\/\//.test(url.trim())) {
      if (result) dismissResult();
      setError('URL must start with https://');
      return;
    }

    setLoading(true);
    if (error) dismissError();
    if (result) dismissResult();

    try {
      const res = await fetch(`/v1/${provider}?url=${encodeURIComponent(url.trim())}&format=json`);

      if (!res.ok) {
        const apiError = await res.json() as ApiError;
        const baseMessage = ERROR_MESSAGES[apiError.code] ?? apiError.message;
        const detail = apiError.details?.[0]?.message;
        setError(detail ? `${baseMessage} ${detail}` : baseMessage);
        return;
      }

      const data = await res.json() as IngestResult;
      setResult(data);
    } catch {
      setError('Could not reach the API. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [url, provider]);

  const output = result
    ? format === 'md'
      ? result.markdown
      : JSON.stringify(result, null, 2)
    : '';

  const handleCopy = useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [result, output]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const ext = format === 'md' ? 'md' : 'json';
    const mime = format === 'md' ? 'text/markdown' : 'application/json';
    const blob = new Blob([output], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `article.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [result, output, format]);

  return (
    <div className="ingestor">
      {/* Input + button in one row */}
      <div className="ingestor-input-row">
        <input
          ref={inputRef}
          type="url"
          className="ingestor-input"
          placeholder="https://medium.com/@user/article..."
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && handleIngest()}
          disabled={loading}
          aria-label="Article URL"
          spellCheck={false}
        />
        <button
          className="btn btn-primary ingestor-submit"
          onClick={handleIngest}
          disabled={loading || !url.trim()}
          type="button"
        >
          {loading ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <>
              <span>Ingest</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>

      {/* Provider selector — segmented control, auto-detected from URL */}
      <div className="ingestor-provider-row">
        <div className="segmented">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              className={`segment ${provider === p.id ? 'segment-active' : ''}`}
              onClick={() => setProvider(p.id)}
              disabled={loading}
              type="button"
            >
              <span className="segment-icon provider-icon" style={{ '--icon-url': `url(${p.icon})` } as React.CSSProperties} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
        <span className="ingestor-hint">auto-detected from URL</span>
      </div>

      {error && (
        <div className={`ingestor-error ${errorVisible ? 'visible' : ''}`}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className={`ingestor-result ${resultVisible ? 'visible' : ''}`}>
          <div className="ingestor-metadata">
              {result.metadata.title && <span className="meta-title">{result.metadata.title}</span>}
              <div className="meta-items">
                {result.metadata.author && <span className="meta-item">{result.metadata.author}</span>}
                {result.metadata.author && result.metadata.reading_time && <ChevronRight size={10} className="meta-sep" />}
                {result.metadata.reading_time && <span className="meta-item">{result.metadata.reading_time}</span>}
                {result.metadata.reading_time && result.metadata.published && <ChevronRight size={10} className="meta-sep" />}
                {result.metadata.published && <span className="meta-item">{result.metadata.published}</span>}
              </div>
            </div>

            {/* Terminal-style output with md/json tabs + text actions */}
            <div className="output-terminal">
              <div className="output-terminal-header">
                <div className="output-tabs">
                  <button
                    className={`output-tab ${format === 'md' ? 'output-tab-active' : ''}`}
                    onClick={() => setFormat('md')}
                    type="button"
                  >
                    markdown
                  </button>
                  <button
                    className={`output-tab ${format === 'json' ? 'output-tab-active' : ''}`}
                    onClick={() => setFormat('json')}
                    type="button"
                  >
                    json
                  </button>
                </div>
                <div className="output-actions">
                  <button className="output-action" onClick={handleCopy} type="button">
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copied ? 'copied' : 'copy'}</span>
                  </button>
                  <button className="output-action" onClick={handleDownload} type="button">
                    <Download size={12} />
                    <span>download</span>
                  </button>
                </div>
              </div>
              <div className="output-terminal-body">
                {output.split('\n').map((line, i) => (
                  <div key={i} className="output-line">
                    <span className="line-number">{i + 1}</span>
                    <span className="line-content">{line}</span>
                  </div>
                ))}
              </div>
            </div>
        </div>
      )}

      <style>{`
        .ingestor {
          width: 100%;
        }
        .ingestor-input-row {
          display: flex;
          gap: var(--space-2);
          margin-bottom: var(--space-3);
        }
        .ingestor-input {
          flex: 1;
          padding: var(--space-3) var(--space-4);
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
          font-family: var(--font-mono);
          line-height: 1.5;
          color: var(--ink);
          outline: none;
          transition: border-color var(--duration-fast) var(--ease-out),
                      box-shadow var(--duration-fast) var(--ease-out);
        }
        .ingestor-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-subtle);
        }
        .ingestor-input::placeholder {
          color: var(--ink-dim);
        }
        .ingestor-submit {
          flex-shrink: 0;
          padding: var(--space-3) var(--space-4);
          transition: opacity var(--duration-fast) var(--ease-out);
        }
        .ingestor-submit:disabled {
          opacity: 0.7;
        }
        .ingestor-provider-row {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          flex-wrap: wrap;
        }
        .segmented {
          display: inline-flex;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .segment {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          border: none;
          border-right: 1px solid var(--border);
          background: transparent;
          color: var(--ink-dim);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .segment:last-child { border-right: none; }
        .segment-icon {
          width: 12px;
          height: 12px;
          opacity: 0.6;
        }
        .segment-active {
          background: var(--accent-subtle);
          color: var(--accent);
        }
        .segment-active .segment-icon { opacity: 1; }
        .segment:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .segment:hover:not(.segment-active):not(:disabled) {
          color: var(--ink);
          background: var(--bg-surface);
        }
        .ingestor-hint {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--ink-dim);
          margin-left: auto;
        }
        .spin {
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .ingestor-error {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.3s var(--ease-out), transform 0.3s var(--ease-out);
          color: var(--error);
          font-size: var(--text-sm);
          padding: var(--space-3);
          background: oklch(65% 0.22 25 / 8%);
          border: 1px solid oklch(65% 0.22 25 / 25%);
          border-radius: var(--radius-sm);
          margin-top: var(--space-3);
        }
        .ingestor-error.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .ingestor-result {
          margin-top: var(--space-6);
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.35s var(--ease-out), transform 0.35s var(--ease-out);
        }
        .ingestor-result.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .ingestor-metadata {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
          font-size: var(--text-sm);
          color: var(--ink-muted);
          margin-bottom: var(--space-3);
          padding-bottom: var(--space-3);
          border-bottom: 1px solid var(--border);
        }
        .meta-title {
          font-family: var(--font-display);
          font-size: var(--text-lg);
          font-weight: 600;
          color: var(--ink);
          width: 100%;
          margin-bottom: var(--space-1);
        }
        .meta-items {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-wrap: wrap;
        }
        .meta-sep {
          color: var(--border-bright);
          flex-shrink: 0;
        }

        /* Terminal-style output block */
        .output-terminal {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          overflow: hidden;
        }
        .output-terminal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-2) var(--space-3);
          border-bottom: 1px solid var(--border);
          background: var(--bg);
        }
        .output-tabs {
          display: flex;
          gap: var(--space-1);
        }
        .output-tab {
          padding: var(--space-1) var(--space-3);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-elevated);
          color: var(--ink-dim);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .output-tab-active {
          color: var(--accent);
          border-color: var(--accent);
          background: var(--accent-subtle);
        }
        .output-actions {
          display: flex;
          gap: var(--space-2);
        }
        .output-action {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1) var(--space-2);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--bg-elevated);
          color: var(--ink-dim);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          cursor: pointer;
          transition: border-color var(--duration-fast) var(--ease-out),
                      color var(--duration-fast) var(--ease-out);
        }
        .output-action:hover {
          border-color: var(--border-bright);
          color: var(--ink);
        }
        .output-action:active { transform: scale(0.97); }
        .output-terminal-body {
          max-height: 500px;
          overflow: auto;
          padding: var(--space-3) 0;
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          line-height: 1.5;
        }
        .output-line {
          display: flex;
          align-items: baseline;
        }
        .output-line:hover {
          background: var(--bg);
        }
        .line-number {
          flex-shrink: 0;
          width: 48px;
          padding: 0 var(--space-3);
          font-size: var(--text-xs);
          color: var(--ink-dim);
          opacity: 0.5;
          text-align: right;
          user-select: none;
        }
        .line-content {
          flex: 1;
          padding-right: var(--space-4);
          white-space: pre-wrap;
          word-break: break-word;
          color: var(--ink);
        }

        @media (max-width: 640px) {
          .ingestor-input-row {
            flex-direction: column;
          }
          .ingestor-submit {
            width: 100%;
            justify-content: center;
          }
          .ingestor-hint {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
