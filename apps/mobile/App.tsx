import { useCallback, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import type { NavigationContainerRef, NavigationState } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './src/screens/Login';
import HomeScreen from './src/screens/Home';
import OrdersScreen from './src/screens/Orders';
import OrderDetailScreen from './src/screens/OrderDetail';
import CustomersScreen from './src/screens/Customers';
import CustomerDetailScreen from './src/screens/CustomerDetail';
import LicenseRequiredScreen from './src/screens/LicenseRequired';
import { fetchLicense, isLicenseEntitled } from './src/license';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Orders: undefined;
  OrderDetail: { id: string };
  Customers: undefined;
  CustomerDetail: { id: string };
  /** T66 — shown when tenant has no active subscription. */
  LicenseRequired: { statusCode?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Returns the topmost active route name from navigation state. */
function activeRouteName(state: NavigationState | undefined): string | undefined {
  if (!state) return undefined;
  return state.routes[state.index]?.name;
}

export default function App() {
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  /**
   * T66 — License gate (UX layer). Called on every navigation state change to an
   * authenticated screen. Fails open on network error so offline users are not
   * locked out. API guards remain the authoritative enforcement layer.
   */
  const checkLicense = useCallback(async () => {
    try {
      const snap = await fetchLicense();
      if (!isLicenseEntitled(snap)) {
        navRef.current?.navigate('LicenseRequired', { statusCode: snap?.status ?? undefined });
      }
    } catch {
      // fail open — API is the source of truth, not the mobile helper
    }
  }, []);

  const onStateChange = useCallback(
    (state: NavigationState | undefined) => {
      const name = activeRouteName(state);
      if (name && name !== 'Login' && name !== 'LicenseRequired') {
        void checkLicense();
      }
    },
    [checkLicense],
  );

  return (
    <NavigationContainer ref={navRef} onStateChange={onStateChange}>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen name="Login"          component={LoginScreen}          options={{ title: 'تسجيل الدخول' }} />
        <Stack.Screen name="Home"           component={HomeScreen}           options={{ title: 'الرئيسية' }} />
        <Stack.Screen name="Orders"         component={OrdersScreen}         options={{ title: 'أوامر البيع' }} />
        <Stack.Screen name="OrderDetail"    component={OrderDetailScreen}    options={{ title: 'تفاصيل الأمر' }} />
        <Stack.Screen name="Customers"      component={CustomersScreen}      options={{ title: 'العملاء' }} />
        <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} options={{ title: 'تفاصيل العميل' }} />
        <Stack.Screen
          name="LicenseRequired"
          options={{ title: 'الاشتراك غير نشط', headerShown: false }}
        >
          {({ route }) => (
            <LicenseRequiredScreen
              status={route.params?.statusCode}
              onSignOut={() =>
                navRef.current?.reset({ index: 0, routes: [{ name: 'Login' }] })
              }
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
