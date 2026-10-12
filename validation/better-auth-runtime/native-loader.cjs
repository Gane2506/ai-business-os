// Keep native import in an untranspiled CJS bridge; TypeScript's CommonJS emit rewrites import().
exports.loadBetterAuth = () => import('better-auth');
exports.loadNodeHandler = () => import('better-auth/node');
