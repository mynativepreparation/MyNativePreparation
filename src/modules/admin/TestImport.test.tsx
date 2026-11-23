import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Question } from '../../core/content/types';
import { t, tf } from '../../core/i18n';
import { TestImport } from './TestImport';

// The import box only turns text into questions: jsdom has no real clipboard, so the paste event gets a fake `clipboardData`.

const GOOD = '1. Capital of India?\nA) Mumbai\nB) **Delhi**\nC) Pune\nD) Surat';
const NO_BOLD = '2. How much is 2 + 2?\nA) 3\nB) 4\nC) 5\nD) 6';

function setup(disabled = false) {
  const added: Question[][] = [];
  render(<TestImport disabled={disabled} onAdd={(questions) => added.push(questions)} />);
  return added;
}

function paste(data: Record<string, string>) {
  const box = screen.getByLabelText(t('admin.test.pasteLabel'));
  const event = createEvent.paste(box);
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => data[type] ?? '' } });
  fireEvent(box, event);
  return event;
}

function chooseFile(content: string, name = 'questions.txt') {
  const file = new File([content], name);
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
  fireEvent.change(screen.getByLabelText(t('admin.test.fileLabel')), { target: { files: [file] } });
}

describe('TestImport', () => {
  it('shows the paste box with its hint and a Load button', () => {
    setup();
    expect(screen.getByLabelText(t('admin.test.pasteLabel'))).toBeInTheDocument();
    expect(screen.getByText(t('admin.test.pasteHint'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('admin.test.loadFile') })).toBeEnabled();
  });

  it('adds the questions of pasted plain text and keeps no text in the box', () => {
    const added = setup();
    const event = paste({ 'text/plain': GOOD });
    expect(event.defaultPrevented).toBe(true);
    expect(added).toHaveLength(1);
    const questions = added.flat();
    expect(questions.map((q) => q.text)).toEqual(['Capital of India?']);
    expect(questions.map((q) => q.options)).toEqual([['Mumbai', 'Delhi', 'Pune', 'Surat']]);
    expect(questions.map((q) => q.correctIndex)).toEqual([1]);
    expect(screen.getByText(tf('admin.test.added', { count: 1 }))).toBeInTheDocument();
    expect(screen.getByLabelText(t('admin.test.pasteLabel'))).toHaveValue('');
  });

  it('reads the bold option from pasted Word HTML', () => {
    const added = setup();
    paste({
      'text/html': '<p>1. Capital of Gujarat?</p><p>A) Surat</p><p>B) Rajkot</p><p>C) <b>Gandhinagar</b></p><p>D) Vadodara</p>',
      'text/plain': '1. Capital of Gujarat?\nA) Surat\nB) Rajkot\nC) Gandhinagar\nD) Vadodara',
    });
    expect(added.flat().map((q) => q.correctIndex)).toEqual([2]);
    expect(added.flat().map((q) => q.options[2])).toEqual(['Gandhinagar']);
  });

  it('reads Gujarati questions', () => {
    const added = setup();
    paste({ 'text/plain': '1. ગુજરાતની રાજધાની કઈ?\nA) સુરત\nB) **ગાંધીનગર**\nC) રાજકોટ\nD) વડોદરા' });
    expect(added.flat().map((q) => q.text)).toEqual(['ગુજરાતની રાજધાની કઈ?']);
    expect(added.flat().map((q) => q.correctIndex)).toEqual([1]);
  });

  it('adds the good questions and lists the bad one with its line number', () => {
    const added = setup();
    paste({ 'text/plain': `${GOOD}\n\n${NO_BOLD}` });
    expect(added.flat()).toHaveLength(1);
    expect(screen.getByText(t('admin.test.errorsHeading'))).toBeInTheDocument();
    expect(screen.getByText(tf('admin.test.err.no_bold_option', { line: 7, found: 0 }))).toBeInTheDocument();
    expect(screen.getByText(tf('admin.test.added', { count: 1 }))).toBeInTheDocument();
  });

  it('tells how many options were found when the count is wrong', () => {
    const added = setup();
    paste({ 'text/plain': '1. Question?\nA) one\nB) **two**\nC) three' });
    expect(added).toEqual([]);
    expect(screen.getByText(tf('admin.test.err.wrong_option_count', { line: 1, found: 3 }))).toBeInTheDocument();
  });

  it('says so when no question is found', () => {
    const added = setup();
    paste({ 'text/plain': '   ' });
    expect(added).toEqual([]);
    expect(screen.getByText(t('admin.test.nothing'))).toBeInTheDocument();
  });

  it('loads a text file', async () => {
    const added = setup();
    chooseFile(GOOD);
    await waitFor(() => expect(added).toHaveLength(1));
    expect(added.flat().map((q) => q.text)).toEqual(['Capital of India?']);
  });

  it('says so when a file cannot be read', async () => {
    const added = setup();
    const file = new File(['x'], 'bad.txt');
    Object.defineProperty(file, 'text', { value: () => Promise.reject(new Error('no')) });
    fireEvent.change(screen.getByLabelText(t('admin.test.fileLabel')), { target: { files: [file] } });
    expect(await screen.findByText(t('admin.test.readError'))).toBeInTheDocument();
    expect(added).toEqual([]);
  });

  it('ignores a paste while disabled', () => {
    const added = setup(true);
    paste({ 'text/plain': GOOD });
    expect(added).toEqual([]);
  });
});
