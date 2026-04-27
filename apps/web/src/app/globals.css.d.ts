// TypeScript 6 requires ambient type declarations for CSS side-effect imports
// when using moduleResolution: bundler + allowArbitraryExtensions
declare const styles: Record<string, never>;
export default styles;
