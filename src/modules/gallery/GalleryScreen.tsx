import { useState, type ReactNode } from 'react';
import { BookOpen, Download, Plus, Settings } from 'lucide-react';
import { useTheme } from '../../core/theme/useTheme';
import type { ThemeMode } from '../../core/theme/theme';
import { Button, Card, IconButton, ProgressBar, StarRating, Surface, TextField, Tile, Toggle, runLayoutCheck } from '../../core/ui';
import { wire } from '../../core/wire/wire';
import './GalleryScreen.css';

const MODES: ThemeMode[] = ['light', 'dark', 'colour'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="np-gallery__section">
      <h2>{title}</h2>
      <div className="np-gallery__row" data-np-check>
        {children}
      </div>
    </Card>
  );
}

// Developer tool: every design-system component in every state. Not in the bottom nav (#/gallery).
export function GalleryScreen() {
  const { mode, setMode } = useTheme();
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const plus = <Plus size={20} aria-hidden="true" />;

  const check = () => {
    const problems = runLayoutCheck();
    const where = `width ${window.innerWidth}px, ${document.documentElement.dataset.theme ?? 'light'} theme`;
    setReport(problems.length === 0 ? `OK (${where})` : `PROBLEMS (${where}):\n` + problems.join('\n'));
  };

  return (
    <section>
      <h1>Gallery</h1>

      <Section title="Layout check">
        <Button onClick={check}>Run layout check</Button>
        {report && (
          <Surface className="np-gallery__report" aria-live="polite">
            {report}
          </Surface>
        )}
      </Section>

      <Section title="Theme">
        {MODES.map((m) => (
          <Button key={m} variant={m === mode ? 'primary' : 'secondary'} aria-pressed={m === mode} onClick={() => setMode(m)}>
            {m}
          </Button>
        ))}
      </Section>

      <Section title="Button">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button size="lg" icon={<Download size={20} aria-hidden="true" />}>
          Large + icon
        </Button>
        <Button disabled>Disabled</Button>
      </Section>

      <Section title="IconButton">
        <IconButton icon={plus} label="Add" />
        <IconButton icon={<Settings size={20} aria-hidden="true" />} label="Settings" />
        <IconButton icon={plus} label="Disabled add" disabled />
      </Section>

      <Section title="Card and Surface">
        <Card>Raised card</Card>
        <Surface>Inset surface</Surface>
      </Section>

      <Section title="Tile">
        <Tile icon={<BookOpen size={32} />} title="Courses" subtitle="3 available" />
        <Tile icon={<BookOpen size={32} />} title="A very long tile title that must wrap onto several lines" />
      </Section>

      <Section title="Toggle">
        <Toggle checked={on} onChange={setOn} label="Sound on" />
        <Toggle checked={off} onChange={setOff} label="Sound off" />
        <Toggle checked={false} onChange={() => undefined} label="Disabled" disabled />
      </Section>

      <Section title="TextField">
        <TextField label="Name" placeholder="Your name" />
        <TextField label="With hint" hint="Shown to teachers" defaultValue="Asha" />
        <TextField label="With error" error="This field is required" />
        <TextField label="Disabled" disabled defaultValue="Locked" />
      </Section>

      <Section title="ProgressBar">
        <ProgressBar value={0} label="Empty progress" />
        <ProgressBar value={40} label="Partial progress" />
        <ProgressBar value={100} label="Full progress" />
      </Section>

      <Section title="StarRating">
        <StarRating value={0} />
        <StarRating value={3} />
        <StarRating value={5} />
      </Section>

      <Section title="Toast">
        <Button variant="secondary" onClick={() => wire.emit('ui.toast', { message: 'Toast from the gallery' })}>
          Show toast
        </Button>
      </Section>
    </section>
  );
}
