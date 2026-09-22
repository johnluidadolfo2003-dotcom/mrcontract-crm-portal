import assert from 'node:assert/strict';
import { applyTheme } from './src/config.ts';

function createTarget(initial: string[] = []) {
  const classes = new Set(initial);
  return {
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
      contains: (name: string) => classes.has(name),
      toggle: (name: string, force?: boolean) => {
        const enabled = force === undefined ? !classes.has(name) : force;
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      },
    },
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
  };
}

const html = createTarget(['light']);
const body = createTarget(['light']);
const root = createTarget(['dark', 'light']);

(globalThis as any).document = {
  documentElement: html,
  body,
  hidden: false,
  getElementById: (id: string) => id === 'root' ? root : null,
};

applyTheme('dark');
for (const target of [html, body, root]) {
  assert.equal(target.classList.contains('dark'), true);
  assert.equal(target.classList.contains('light'), false);
  assert.equal(target.dataset.theme, 'dark');
}
assert.equal(html.style.colorScheme, 'dark');

applyTheme('light');
for (const target of [html, body, root]) {
  assert.equal(target.classList.contains('light'), true);
  assert.equal(target.classList.contains('dark'), false);
  assert.equal(target.dataset.theme, 'light');
}
assert.equal(html.style.colorScheme, 'light');

console.log('Theme resume synchronization tests passed.');
