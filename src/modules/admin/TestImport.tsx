import { useId, useRef, useState, type ChangeEvent, type ClipboardEvent } from 'react';
import { FileText } from 'lucide-react';
import { htmlToMarkedText } from '../../core/admin/parsePaste';
import { parseTestText, type TestParseCode, type TestParseError } from '../../core/admin/parseTest';
import type { Question } from '../../core/content/types';
import { t, tf, type TextKey } from '../../core/i18n';
import { Button } from '../../core/ui';
import './BlockEditor.css';

// Test import (P10 T8(a), SPEC D4): paste from Word (the bold option is the correct one) or load a text file; the text goes
// through `parseTestText`. Good questions are handed to `onAdd`; every bad one is listed with its line number and skipped, so
// nothing is lost silently. The box keeps no text (typing does nothing). Styles are shared with BlockEditor.css.

interface TestImportProps {
  /** New questions (with new ids). The caller appends them to the test. */
  onAdd: (questions: Question[]) => void;
  disabled?: boolean;
}

const ERROR_TEXT: Record<TestParseCode, TextKey> = {
  text_before_first_question: 'admin.test.err.text_before_first_question',
  empty_question: 'admin.test.err.empty_question',
  wrong_option_count: 'admin.test.err.wrong_option_count',
  empty_option: 'admin.test.err.empty_option',
  no_bold_option: 'admin.test.err.no_bold_option',
  multiple_bold_options: 'admin.test.err.multiple_bold_options',
};

interface Outcome {
  added: number;
  errors: TestParseError[];
}

async function readText(file: File): Promise<string | null> {
  try {
    return await file.text();
  } catch {
    return null;
  }
}

function errorLine(error: TestParseError): string {
  return tf(ERROR_TEXT[error.code], { line: error.line, found: error.found ?? 0 });
}

const nothing = (): void => undefined;

export function TestImport({ onAdd, disabled = false }: TestImportProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const fileInput = useRef<HTMLInputElement>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [readFailed, setReadFailed] = useState(false);

  function run(source: string) {
    setReadFailed(false);
    const result = parseTestText(source);
    if (result.questions.length > 0) onAdd(result.questions);
    setOutcome({ added: result.questions.length, errors: result.errors });
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    if (disabled) return;
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    // Word keeps the bold runs in the HTML; the plain text has lost them.
    const marked = html.trim() === '' ? '' : htmlToMarkedText(html);
    run(marked.trim() !== '' ? marked : text);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files === null ? undefined : Array.from(input.files).shift();
    input.value = '';
    if (file === undefined) return;
    const text = await readText(file);
    if (text === null) {
      setOutcome(null);
      setReadFailed(true);
      return;
    }
    run(text);
  }

  const failed = outcome !== null && outcome.errors.length > 0;
  return (
    <section className="np-block-editor" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`} className="np-block-editor__heading">
        {t('admin.test.importHeading')}
      </h3>
      <div className="np-block-editor__area-field">
        <label className="np-block-editor__label" htmlFor={id}>
          {t('admin.test.pasteLabel')}
        </label>
        <p id={hintId} className="np-block-editor__text">
          {t('admin.test.pasteHint')}
        </p>
        <textarea
          id={id}
          className="np-block-editor__area"
          rows={3}
          value=""
          onChange={nothing}
          onPaste={onPaste}
          aria-describedby={hintId}
          disabled={disabled}
        />
      </div>
      <div className="np-block-editor__adds">
        <Button
          variant="secondary"
          icon={<FileText size={20} aria-hidden="true" />}
          onClick={() => fileInput.current?.click()}
          disabled={disabled}
        >
          {t('admin.test.loadFile')}
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".txt,text/plain"
        hidden
        aria-label={t('admin.test.fileLabel')}
        onChange={(e) => void onFile(e)}
      />
      {outcome !== null && outcome.added > 0 && (
        <p role="status" className="np-block-editor__status">
          {tf('admin.test.added', { count: outcome.added })}
        </p>
      )}
      {outcome !== null && outcome.added === 0 && !failed && (
        <p role="alert" className="np-block-editor__error">
          <span aria-hidden="true">! </span>
          {t('admin.test.nothing')}
        </p>
      )}
      {readFailed && (
        <p role="alert" className="np-block-editor__error">
          <span aria-hidden="true">! </span>
          {t('admin.test.readError')}
        </p>
      )}
      {outcome !== null && failed && (
        <div role="alert" className="np-block-editor__error">
          <p>
            <span aria-hidden="true">! </span>
            {t('admin.test.errorsHeading')}
          </p>
          <ul>
            {outcome.errors.map((error) => (
              <li key={`${error.line}-${error.code}`}>{errorLine(error)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
