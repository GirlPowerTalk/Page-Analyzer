import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, AlertTriangle, Save, X, Edit, Undo2, Redo2, Copy, Download, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { findTextDifferences, TextChange, formatTextWithChanges, convertToHighlightedHTML } from "@/lib/diffUtils";
import TextOverlay from "@/components/TextOverlay";
import { toast } from "sonner";
import { useThrottleCallback } from "@/hooks/useThrottleCallback";

interface QueryData {
  query: string;
  impressions: number;
  occurrences: number;
}

interface PageContentProps {
  pageData: {
    title: string;
    content: string;
  };
  queryData: QueryData[];
  onSave?: (newContent: string) => void;
  onContentChanged?: (content: string) => void;
}

const PageContent = ({ pageData, queryData, onSave, onContentChanged }: PageContentProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  const [initialContent, setInitialContent] = useState(pageData.content);
  const [comparisonBase, setComparisonBase] = useState(pageData.content);
  const [originalContent, setOriginalContent] = useState(pageData.content);
  const [editedContent, setEditedContent] = useState(pageData.content);
  const [textChanges, setTextChanges] = useState<TextChange[]>([]);
  const [allChanges, setAllChanges] = useState<TextChange[]>([]);
  const [showHighlights, setShowHighlights] = useState(true);

  const [history, setHistory] = useState<string[]>([pageData.content]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const contentContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update content on page load/change
  useEffect(() => {
    setInitialContent(pageData.content);
    setOriginalContent(pageData.content);
    setEditedContent(pageData.content);
    setComparisonBase(pageData.content);
    setTextChanges([]);
    setAllChanges([]);
    setHistory([pageData.content]);
    setHistoryIndex(0);
    setShowHighlights(true);
    setSearchTerm("");
    setActiveQuery(null);
  }, [pageData]);

  // Debounce edited content
  const debouncedEditedContent = editedContent;

  // Compute diffs
  useEffect(() => {
    const base = comparisonBase;
    const target = editMode ? debouncedEditedContent : originalContent;

    if (!showHighlights || base === target) {
      setTextChanges([]);
      return;
    }

    const changes = findTextDifferences(base, target);
    setTextChanges(changes);

    if (onContentChanged && originalContent !== debouncedEditedContent) {
      onContentChanged(debouncedEditedContent);
    }
  }, [comparisonBase, debouncedEditedContent, originalContent, onContentChanged, showHighlights, editMode]);

  const topMissedQueries = queryData
    .filter(q => q.impressions > 50 && q.occurrences === 0)
    .slice(0, 5)
    .map(q => q.query);

  const handleHighlightQuery = (query: string) => {
    setActiveQuery(query === activeQuery ? null : query);
    setSearchTerm(query === activeQuery ? "" : query);
  };

  const parseHeading = (block: string) => {
    const headingMatch = block.match(/^(#+)\s+(.*)/);
    if (headingMatch) {
      const prefix = headingMatch[1];
      return { isHeading: true, level: prefix.length, prefix, text: headingMatch[2], fullText: block };
    }
    return { isHeading: false, fullText: block };
  };

  const highlightText = (text: string, term: string) => {
    if (!term.trim()) return text;
    const parts = text.split(new RegExp(`(${term})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === term.toLowerCase() ? <mark key={i} className="bg-yellow-200 text-yellow-800">{part}</mark> : part
        )}
      </>
    );
  };

  const handleSaveChanges = () => {
    if (onSave) onSave(editedContent);

    const newChanges = findTextDifferences(originalContent, editedContent);
    setAllChanges(prev => [...prev, ...newChanges]);
    setComparisonBase(editedContent);
    setOriginalContent(editedContent);
    setEditMode(false);
    setShowHighlights(true);
    toast.success("Changes saved successfully");
  };

  const handleDiscardChanges = () => {
    setEditedContent(initialContent);
    setOriginalContent(initialContent);
    setComparisonBase(initialContent);
    setAllChanges([]);
    setHistory([initialContent]);
    setHistoryIndex(0);
    setEditMode(false);
    setSearchTerm("");
    setActiveQuery(null);
    toast.info("Changes discarded — reverted to original");
  };

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    if (newContent !== editedContent) {
      const newHistory = [...history.slice(0, historyIndex + 1), newContent];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setEditedContent(newContent);
    }
  }, [editedContent, history, historyIndex]);

  const throttledContentChange = useThrottleCallback(handleContentChange, 5);

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setEditedContent(history[historyIndex - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setEditedContent(history[historyIndex + 1]);
    }
  };

  const toggleShowChanges = () => setShowHighlights(!showHighlights);

  const copyWithHighlights = () => {
    const contentToCopy = editMode ? editedContent : originalContent;
    const html = convertToHighlightedHTML(contentToCopy, textChanges);
    const element = document.createElement('div');
    element.innerHTML = html;
    element.style.position = 'absolute';
    element.style.left = '-9999px';
    document.body.appendChild(element);
    window.getSelection()?.selectAllChildren(element);
    try {
      document.execCommand('copy') ? toast.success('Content with highlights copied') : toast.error('Failed to copy');
    } catch { toast.error('Failed to copy'); }
    document.body.removeChild(element);
    window.getSelection()?.removeAllRanges();
  };

  const exportWithHighlights = () => {
    const contentToExport = editMode ? editedContent : originalContent;
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${pageData.title}</title><style>
body{font-family:system-ui,-apple-system,sans-serif;line-height:1.5;max-width:800px;margin:0 auto;padding:2rem}
h1,h2,h3,h4,h5,h6{margin-top:2rem;margin-bottom:1rem}p{margin-bottom:1rem}
</style></head><body>
<h1>${pageData.title}</h1>
${convertToHighlightedHTML(contentToExport, textChanges)}
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${pageData.title.replace(/\s+/g, '_')}_with_changes.html`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
    toast.success('Content exported with highlights');
  };
const renderContentWithChanges = useCallback((content: string, changes: TextChange[]) => {
  const lines = content.split('\n'); // split by single line
  let currentPosition = 0;

  return lines.map((line, idx) => {
    const lineStart = currentPosition;
    const lineLength = line.length;
    const headingInfo = parseHeading(line);

    const relevantChanges = changes.filter(change => {
      if (change.type === 'insertion') return change.position >= lineStart && change.position < (lineStart + lineLength);
      else if (change.type === 'deletion' && change.originalPosition !== undefined) return change.originalPosition >= lineStart && change.originalPosition < (lineStart + lineLength);
      return false;
    });

    const adjustedChanges = relevantChanges.map(change => 
      change.type === 'deletion' && change.originalPosition !== undefined 
        ? { ...change, position: change.originalPosition - lineStart } 
        : { ...change, position: change.position - lineStart }
    );

    currentPosition += lineLength + 1; // +1 for \n

    if (headingInfo.isHeading) {
      const HeadingTag = `h${headingInfo.level}` as keyof JSX.IntrinsicElements;
      const prefixLength = headingInfo.prefix.length + 1;
      const headingTextChanges = adjustedChanges.map(change => ({
        ...change,
        position: Math.max(0, change.position - prefixLength)
      }));

      return (
        <HeadingTag key={idx} className={`font-bold ${
          headingInfo.level===1?'text-2xl mt-6 mb-3':
          headingInfo.level===2?'text-xl mt-5 mb-2':'text-lg mt-4 mb-2'
        }`}>
          {showHighlights && headingTextChanges.length > 0
            ? formatTextWithChanges(headingInfo.text, headingTextChanges)
            : highlightText(headingInfo.text, searchTerm)}
        </HeadingTag>
      );
    }

    if (showHighlights && adjustedChanges.length > 0) return <p key={idx} className="mb-2">{formatTextWithChanges(line, adjustedChanges)}</p>;
    return <p key={idx} className="mb-2">{highlightText(line, searchTerm)}</p>;
  });
}, [showHighlights, searchTerm]);


  const isError = pageData.title.toLowerCase().includes('error');
  const hasChanges = originalContent !== editedContent;
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const shouldShowOverlay = editMode && textChanges.length > 0 && showHighlights;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center gap-2">
        <div className="relative flex-grow">
          <Search size={16} className="absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search in content..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        {!isError && (
          <div className="flex gap-2">
            {editMode ? (
              <>
                <Button variant="outline" size="sm" onClick={handleUndo} disabled={!canUndo} className="flex items-center gap-1" title="Undo">
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleRedo} disabled={!canRedo} className="flex items-center gap-1" title="Redo">
                  <Redo2 className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleDiscardChanges} className="flex items-center gap-1">
                  <X className="h-4 w-4" /> Cancel
                </Button>
                <Button variant={hasChanges ? "default" : "outline"} size="sm" onClick={handleSaveChanges} disabled={!hasChanges} className="flex items-center gap-1">
                  <Save className="h-4 w-4" /> Save
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={copyWithHighlights} className="flex items-center gap-1" title="Copy with highlights">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={exportWithHighlights} className="flex items-center gap-1" title="Export with highlights">
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={toggleShowChanges} className="flex items-center gap-1">
                  {showHighlights ? <><EyeOff className="h-4 w-4" /> Hide Changes</> : <><Eye className="h-4 w-4" /> Show Changes</>}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditMode(true)} className="flex items-center gap-1">
                  <Edit className="h-4 w-4" /> Edit
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {topMissedQueries.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {topMissedQueries.map((query) => (
            <Badge key={query} variant={activeQuery === query ? "default" : "outline"} className="cursor-pointer" onClick={() => handleHighlightQuery(query)}>
              {query}
            </Badge>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-xl font-bold mb-4">{pageData.title}</h2>
          <div className="prose max-w-none">
            {isError ? (
              <Alert className="bg-amber-50 text-amber-800 border-amber-200 mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{pageData.content}</AlertDescription>
              </Alert>
            ) : (
              <div className="bg-white p-4 rounded-md border text-sm leading-relaxed max-h-[600px] overflow-y-auto relative" ref={contentContainerRef}>
           {editMode ? (
  <div className="relative">
    <Textarea
      ref={textareaRef}
      value={editedContent}
      onChange={throttledContentChange}
      className="min-h-[400px] h-full w-full p-0 border-0 shadow-none font-mono whitespace-pre-wrap leading-relaxed focus-visible:ring-0"
      style={{ resize: "none", outline: "none", position: "relative", zIndex: 10, backgroundColor: "transparent" }}
    />
    <TextOverlay
      originalText={comparisonBase}
      editedText={editedContent}
      changes={textChanges}       // ✅ only current unsaved changes
      isVisible={showHighlights}
      scrollContainer={contentContainerRef}
      editMode={false}
    />
  </div>
) : (
  <div className="relative">
    {renderContentWithChanges(
      showHighlights ? originalContent : initialContent,
      showHighlights ? [...allChanges, ...textChanges] : []
    )}
  </div>
)}


              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PageContent;