import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { t } from '../../core/i18n';
import { SectionPlaceholder } from './SectionPlaceholder';

const ID = 'crs_aaaaaaaa';

function renderPlaceholder() {
  return render(
    <MemoryRouter initialEntries={[`/course/${ID}/overview`]}>
      <Routes>
        <Route path="/course/:courseId/overview" element={<SectionPlaceholder section="overview" />} />
        <Route path="/course/:courseId" element={<p>COURSE SCREEN</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SectionPlaceholder', () => {
  it('has one h1 with the section name and says it is coming later', () => {
    renderPlaceholder();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: t('course.tile.overview') })).toBeInTheDocument();
    expect(screen.getByText(t('course.comingSoon'))).toBeInTheDocument();
  });

  it('Back goes to the same course', async () => {
    renderPlaceholder();
    fireEvent.click(screen.getByRole('button', { name: t('course.backToCourse') }));
    expect(await screen.findByText('COURSE SCREEN')).toBeInTheDocument();
  });
});
