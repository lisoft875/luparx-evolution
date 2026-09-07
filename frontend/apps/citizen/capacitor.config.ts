import type { CapacitorConfig } from '@capacitor/cli';

/**
 * appId/appName are placeholders — override per deployment target (e.g. a
 * white-labeled municipality build) before running `cap sync`.
 */
const config: CapacitorConfig = {
  appId: process.env.LUPARX_CITIZEN_APP_ID ?? 'cr.luparx.citizen',
  appName: process.env.LUPARX_CITIZEN_APP_NAME ?? 'LupaRX Ciudadano',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
};

export default config;
