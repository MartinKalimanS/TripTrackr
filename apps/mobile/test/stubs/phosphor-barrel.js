/**
 * What `jest.config.js` maps the bare `phosphor-react-native` specifier to (feature 005,
 * research D5-07): an error, because the package root re-exports all 1,500 icons and a
 * suite that loads it transforms every one of them. Types are unaffected: a type-only
 * `import type { IconProps } from 'phosphor-react-native'` is erased before Jest sees it.
 */
throw new Error(
  'phosphor-react-native: import an icon by its deep path, ' +
    "`import { GlobeIcon } from 'phosphor-react-native/src/icons/Globe'`, never the package " +
    'root, which would load all 1,500 icons (research D5-07).',
);
