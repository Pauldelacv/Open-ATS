"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export type RichTextLabels = {
  toolbar: string;
  bold: string;
  italic: string;
  heading2: string;
  heading3: string;
  bulletList: string;
  orderedList: string;
  link: string;
  linkUrl: string;
  applyLink: string;
  removeLink: string;
};

export function RichTextEditor({
  value,
  onChange,
  labels,
  placeholder,
  id,
  name,
  invalid,
  describedBy,
  minHeight = "min-h-48",
}: {
  value: string;
  onChange: (html: string) => void;
  labels: RichTextLabels;
  placeholder?: string;
  id?: string;
  name?: string;
  invalid?: boolean;
  describedBy?: string;
  minHeight?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn("rich-text rich-text-compact px-3 py-2.5 focus:outline-none", minHeight),
        ...(id ? { id } : {}),
        role: "textbox",
        "aria-multiline": "true",
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(invalid ? { "aria-invalid": "true" } : {}),
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });

  return (
    <div
      className={cn(
        "rounded-sm border bg-paper transition-colors duration-[120ms]",
        "focus-within:border-cobalt focus-within:outline-1 focus-within:outline-cobalt",
        invalid
          ? "border-danger focus-within:outline-danger"
          : "border-line-strong hover:border-ink-muted",
      )}
    >
      {editor ? (
        <Toolbar editor={editor} labels={labels} />
      ) : (
        <div className="h-9 border-b border-line" />
      )}
      <EditorContent editor={editor} />
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}

function Toolbar({ editor, labels }: { editor: Editor; labels: RichTextLabels }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      link: e.isActive("link"),
    }),
  });
  return (
    <div
      role="toolbar"
      aria-label={labels.toolbar}
      className="flex h-9 items-center gap-0.5 border-b border-line px-1"
    >
      <ToolButton
        label={labels.bold}
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold />
      </ToolButton>
      <ToolButton
        label={labels.italic}
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic />
      </ToolButton>
      <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
      <ToolButton
        label={labels.heading2}
        active={state.h2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 />
      </ToolButton>
      <ToolButton
        label={labels.heading3}
        active={state.h3}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 />
      </ToolButton>
      <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
      <ToolButton
        label={labels.bulletList}
        active={state.bullet}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List />
      </ToolButton>
      <ToolButton
        label={labels.orderedList}
        active={state.ordered}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered />
      </ToolButton>
      <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
      <LinkButton editor={editor} labels={labels} active={state.link} />
    </div>
  );
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-sm text-ink-muted hover:bg-stone hover:text-ink [&_svg]:size-4",
        active && "bg-stone-strong text-ink",
      )}
    >
      {children}
    </button>
  );
}

function LinkButton({
  editor,
  labels,
  active,
}: {
  editor: Editor;
  labels: RichTextLabels;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setUrl((editor.getAttributes("link").href as string | undefined) ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={labels.link}
          title={labels.link}
          aria-pressed={active}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-sm text-ink-muted hover:bg-stone hover:text-ink [&_svg]:size-4",
            active && "bg-stone-strong text-ink",
          )}
        >
          <Link2 />
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const href = url.trim();
            const chain = editor.chain().focus().extendMarkRange("link");
            if (href) chain.setLink({ href }).run();
            else chain.unsetLink().run();
            setOpen(false);
          }}
        >
          <label className="text-13 font-medium" htmlFor="rte-link-url">
            {labels.linkUrl}
          </label>
          <Input
            id="rte-link-url"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            {active ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setOpen(false);
                }}
              >
                {labels.removeLink}
              </Button>
            ) : null}
            <Button size="sm" variant="primary" type="submit">
              {labels.applyLink}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
