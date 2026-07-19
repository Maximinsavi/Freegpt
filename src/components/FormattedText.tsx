import React, { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';

interface CodeBlock {
  type: 'code';
  language: string;
  code: string;
}

interface TextBlock {
  type: 'text';
  text: string;
}

type ContentBlock = CodeBlock | TextBlock;

function parseContent(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) {
      blocks.push({ type: 'text', text: textBefore });
    }
    blocks.push({
      type: 'code',
      language: match[1] || 'code',
      code: match[2]
    });
    lastIndex = regex.lastIndex;
  }

  const textAfter = content.substring(lastIndex);
  if (textAfter) {
    blocks.push({ type: 'text', text: textAfter });
  }

  return blocks;
}

interface FormattedTextProps {
  content: string;
}

export default function FormattedText({ content }: FormattedTextProps) {
  const blocks = parseContent(content);

  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-gray-200">
      {blocks.map((block, idx) => {
        if (block.type === 'code') {
          return <CodeRenderer key={idx} language={block.language} code={block.code} />;
        }
        return <TextRenderer key={idx} text={block.text} />;
      })}
    </div>
  );
}

interface CodeRendererProps {
  key?: React.Key;
  language: string;
  code: string;
}

function CodeRenderer({ language, code }: CodeRendererProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code: ', err);
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-gray-800 bg-gray-950 font-mono text-sm shadow-lg">
      <div className="flex items-center justify-between border-b border-gray-900 bg-gray-900/80 px-4 py-2 text-xs text-gray-400 select-none">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-semibold uppercase tracking-wider text-gray-300">{language}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          title="Copier le code"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copié !</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copier</span>
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto p-4">
        <pre className="text-gray-100 selection:bg-emerald-500/30">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

interface TextRendererProps {
  key?: React.Key;
  text: string;
}

function TextRenderer({ text }: TextRendererProps) {
  // Split block by lines to parse structures
  const lines = text.split('\n');
  const renderedElements: React.ReactNode[] = [];
  
  let currentListItems: React.ReactNode[] = [];
  let currentListType: 'bullet' | 'ordered' | null = null;

  const pushPendingList = (key: string) => {
    if (currentListItems.length > 0) {
      if (currentListType === 'bullet') {
        renderedElements.push(
          <ul key={`ul-${key}`} className="my-3 list-disc pl-6 space-y-1.5 text-gray-300">
            {...currentListItems}
          </ul>
        );
      } else if (currentListType === 'ordered') {
        renderedElements.push(
          <ol key={`ol-${key}`} className="my-3 list-decimal pl-6 space-y-1.5 text-gray-300">
            {...currentListItems}
          </ol>
        );
      }
      currentListItems = [];
      currentListType = null;
    }
  };

  lines.forEach((line, index) => {
    const key = `${index}-${line.slice(0, 10)}`;
    
    // Check for bullet list item: starts with '- ' or '* '
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bulletMatch) {
      if (currentListType !== 'bullet') {
        pushPendingList(key);
        currentListType = 'bullet';
      }
      currentListItems.push(
        <li key={`li-${key}`} className="leading-relaxed">
          {renderTextInline(bulletMatch[2])}
        </li>
      );
      return;
    }

    // Check for ordered list item: starts with '1. ', '2. ', etc.
    const orderedMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (orderedMatch) {
      if (currentListType !== 'ordered') {
        pushPendingList(key);
        currentListType = 'ordered';
      }
      currentListItems.push(
        <li key={`li-${key}`} className="leading-relaxed">
          {renderTextInline(orderedMatch[2])}
        </li>
      );
      return;
    }

    // Line is not a list item, push any pending list first
    pushPendingList(key);

    // Empty line check
    if (line.trim() === '') {
      renderedElements.push(<div key={`space-${key}`} className="h-2" />);
      return;
    }

    // Headers check
    if (line.startsWith('### ')) {
      renderedElements.push(
        <h3 key={`h3-${key}`} className="mt-4 mb-2 font-display text-base font-bold text-white tracking-wide">
          {renderTextInline(line.substring(4))}
        </h3>
      );
    } else if (line.startsWith('## ')) {
      renderedElements.push(
        <h2 key={`h2-${key}`} className="mt-5 mb-2.5 font-display text-lg font-bold text-white tracking-wide border-b border-gray-800/50 pb-1">
          {renderTextInline(line.substring(3))}
        </h2>
      );
    } else if (line.startsWith('# ')) {
      renderedElements.push(
        <h1 key={`h1-${key}`} className="mt-6 mb-3 font-display text-xl font-bold text-white tracking-wide border-b border-gray-800 pb-1.5">
          {renderTextInline(line.substring(2))}
        </h1>
      );
    } else {
      // Standard paragraph
      renderedElements.push(
        <p key={`p-${key}`} className="my-2 text-gray-300 leading-relaxed break-words">
          {renderTextInline(line)}
        </p>
      );
    }
  });

  // Handle any leftover list items
  pushPendingList(`final-${lines.length}`);

  return <div className="space-y-1">{renderedElements}</div>;
}

// Inline formatting parser for Bold (**bold**) and Italic (*italic*) and Inline Code (`code`)
function renderTextInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyCounter = 0;

  // Pattern matches inline code `code`, bold **bold**, or italic *italic*
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const splitParts = remaining.split(pattern);

  return splitParts.map((part, idx) => {
    const key = `${idx}-${keyCounter++}`;
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} className="mx-1 rounded bg-gray-850 px-1.5 py-0.5 font-mono text-xs text-emerald-400 border border-gray-800">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={key} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={key} className="italic text-gray-300">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}
