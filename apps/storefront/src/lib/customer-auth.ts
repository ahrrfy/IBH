/**
 * Customer-portal token management (T56).
 * Re-exports the existing localStorage-backed helpers under a clearer name
 * so portal components don't share an import path with public auth flows.
 */
export {
  setToken as setCustomerToken,
  getToken as getCustomerToken,
  getPhone as getCustomerPhone,
  isLoggedIn as isCustomerLoggedIn,
  logout as customerLogout,
} from './auth';
