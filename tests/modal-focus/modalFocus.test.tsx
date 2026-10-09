// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { Modal } from '../../src/components/common/Modal';

afterEach(() => cleanup());

// Mimics every real call site: inline onClose closure (new identity per render)
// + controlled input that re-renders the parent on every keystroke.
function Harness() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  return (
    <div>
      <button data-testid="opener" onClick={() => setOpen(true)}>
        open
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Test dialog">
        <input data-testid="name" value={value} onChange={(e) => setValue(e.target.value)} />
      </Modal>
    </div>
  );
}

function openModal() {
  fireEvent.click(screen.getByTestId('opener'));
}

describe('Modal focus management (BUG-005)', () => {
  it('keeps focus in the text input while typing (parent re-renders each keystroke)', () => {
    render(<Harness />);
    openModal();
    const input = screen.getByTestId('name') as HTMLInputElement;
    input.focus(); // what a real user click does
    expect(document.activeElement).toBe(input);
    for (const ch of ['a', 'b', 'c', 'd', 'e']) {
      fireEvent.change(input, { target: { value: input.value + ch } });
      expect(document.activeElement).toBe(input);
    }
    expect(input.value).toBe('abcde');
  });

  it('moves initial focus to the dialog close button on open (existing behavior)', () => {
    render(<Harness />);
    openModal();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close Test dialog dialog');
  });

  it('returns focus to the opener on close and calls onClose on Escape', () => {
    render(<Harness />);
    const opener = screen.getByTestId('opener');
    opener.focus();
    fireEvent.click(opener); // opens; effect records opener as previously focused
    expect(screen.queryByTestId('name')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('name')).toBeNull(); // closed via onClose
    expect(document.activeElement).toBe(opener);
  });
});
