import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './src/screens/Login';
import HomeScreen from './src/screens/Home';
import OrdersScreen from './src/screens/Orders';
import OrderDetailScreen from './src/screens/OrderDetail';
import CustomersScreen from './src/screens/Customers';
import CustomerDetailScreen from './src/screens/CustomerDetail';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Orders: undefined;
  OrderDetail: { id: string };
  Customers: undefined;
  CustomerDetail: { id: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen name="Login"     component={LoginScreen}     options={{ title: 'تسجيل الدخول' }} />
        <Stack.Screen name="Home"      component={HomeScreen}      options={{ title: 'الرئيسية' }} />
        <Stack.Screen name="Orders"      component={OrdersScreen}      options={{ title: 'أوامر البيع' }} />
        <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: 'تفاصيل الأمر' }} />
        <Stack.Screen name="Customers" component={CustomersScreen} options={{ title: 'العملاء' }} />
        <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} options={{ title: 'تفاصيل العميل' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
