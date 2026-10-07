// Side-effect and default imports of stylesheets (`import '@/global.css'`).
// expo/types declares the same module, but it arrives through the generated,
// git-ignored `expo-env.d.ts`, which a fresh clone or a CI runner does not have.
declare module '*.css';
