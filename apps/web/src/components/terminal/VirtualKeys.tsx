import { useTerminalStore } from '../../stores/terminalStore';
import { cn } from '../../lib/utils';

interface VKey {
  label: string;
  send?: string;
  sticky?: boolean;
  modifier?: 'ctrl' | 'alt' | 'shift';
}

const VIRTUAL_KEYS: VKey[] = [
  { label: 'Ctrl', modifier: 'ctrl', sticky: true },
  { label: 'Alt', modifier: 'alt', sticky: true },
  { label: 'Tab', send: '\t' },
  { label: 'Esc', send: '\x1b' },
  { label: '↑', send: '\x1b[A' },
  { label: '↓', send: '\x1b[B' },
  { label: '←', send: '\x1b[D' },
  { label: '→', send: '\x1b[C' },
  { label: 'Home', send: '\x1b[H' },
  { label: 'End', send: '\x1b[F' },
  { label: 'PgUp', send: '\x1b[5~' },
  { label: 'PgDn', send: '\x1b[6~' },
  { label: 'Del', send: '\x1b[3~' },
  { label: 'C-c', send: '\x03' },
  { label: 'C-d', send: '\x04' },
  { label: 'C-z', send: '\x1a' },
];

export default function VirtualKeys() {
  const {
    terminal,
    ctrlActive,
    altActive,
    shiftActive,
    toggleCtrl,
    toggleAlt,
    toggleShift,
    clearModifiers,
  } = useTerminalStore();

  const handleKeyPress = (key: VKey) => {
    if (!terminal) return;

    if (key.modifier) {
      // Toggle modifier state
      switch (key.modifier) {
        case 'ctrl':
          toggleCtrl();
          break;
        case 'alt':
          toggleAlt();
          break;
        case 'shift':
          toggleShift();
          break;
      }
      return;
    }

    if (key.send) {
      let data = key.send;

      // Apply modifiers
      if (ctrlActive && data.length === 1) {
        // Convert to control character
        const code = data.charCodeAt(0);
        if (code >= 64 && code <= 95) {
          data = String.fromCharCode(code - 64);
        } else if (code >= 97 && code <= 122) {
          data = String.fromCharCode(code - 96);
        }
      }

      // Write to terminal
      terminal.paste(data);

      // Clear modifiers after use
      clearModifiers();
    }
  };

  const isModifierActive = (modifier?: 'ctrl' | 'alt' | 'shift') => {
    if (!modifier) return false;
    switch (modifier) {
      case 'ctrl':
        return ctrlActive;
      case 'alt':
        return altActive;
      case 'shift':
        return shiftActive;
    }
  };

  return (
    <div className="flex gap-1 px-2 py-1.5 bg-surface flex-shrink-0 overflow-x-auto scrollbar-none">
      {VIRTUAL_KEYS.map((key) => (
        <button
          key={key.label}
          className={cn(
            'vkey',
            key.sticky && isModifierActive(key.modifier) && 'sticky active'
          )}
          onClick={() => handleKeyPress(key)}
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}
