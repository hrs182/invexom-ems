/** sql.js ships no TypeScript declarations; the adapter uses loose typing. */
declare module 'sql.js' {
  const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<any>;
  export default initSqlJs;
}
