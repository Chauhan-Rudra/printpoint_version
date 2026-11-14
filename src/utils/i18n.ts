import { useUserProfile, UserProfile } from './userProfile';

export type SupportedLanguage = UserProfile['language'];

export interface TranslationDictionary {
  navHome: string;
  navFiles: string;
  navScan: string;
  navTools: string;
  navAccount: string;
  homeUploadTitle: string;
  homeUploadSubtitle: string;
  homeBrowseFiles: string;
  homeScanQr: string;
  homeTakePhoto: string;
  homeHowToPrint: string;
  homeReadyToPrint: string;
  homeContinueToPrint: string;
  scannerTitle: string;
  scannerSubtitle: string;
  scannerBack: string;
  filesTitle: string;
  filesSearchPlaceholder: string;
  editorTitle: string;
  previewPrintTitle: string;
  payAndPrint: string;
  summaryTitle: string;
  accountTitle: string;
  walletTitle: string;
  addMoney: string;
  myOrders: string;
  savedFiles: string;
  notifications: string;
  language: string;
  helpSupport: string;
  signOut: string;
  toolsTitle: string;
}

const TRANSLATIONS: Record<SupportedLanguage, TranslationDictionary> = {
  English: {
    navHome: 'Home',
    navFiles: 'Files',
    navScan: 'Scan',
    navTools: 'Tools',
    navAccount: 'Account',
    homeUploadTitle: 'Add documents to print',
    homeUploadSubtitle: 'PDF, Word, Excel, PowerPoint, and images up to 100 MB',
    homeBrowseFiles: 'Choose from device',
    homeScanQr: 'Scan Kiosk QR',
    homeTakePhoto: 'Take Photo',
    homeHowToPrint: 'How printing works',
    homeReadyToPrint: 'Ready to print',
    homeContinueToPrint: 'Continue to Print',
    scannerTitle: 'Scan Kiosk QR',
    scannerSubtitle: 'Point your camera at the QR code on the printer screen',
    scannerBack: 'Back',
    filesTitle: 'Saved Files',
    filesSearchPlaceholder: 'Search documents or file types...',
    editorTitle: 'Edit Pages',
    previewPrintTitle: 'Print Settings',
    payAndPrint: 'Review & Pay',
    summaryTitle: 'Order Summary',
    accountTitle: 'My Account',
    walletTitle: 'Print Point Wallet',
    addMoney: 'Add Money',
    myOrders: 'My Orders',
    savedFiles: 'Saved Files',
    notifications: 'Notifications',
    language: 'Language',
    helpSupport: 'Help & Support',
    signOut: 'Sign Out',
    toolsTitle: 'Document Tools',
  },
  ગુજરાતી: {
    navHome: 'હોમ',
    navFiles: 'ફાઇલો',
    navScan: 'સ્કેન',
    navTools: 'ટૂલ્સ',
    navAccount: 'એકાઉન્ટ',
    homeUploadTitle: 'પ્રિન્ટ માટે દસ્તાવેજો ઉમેરો',
    homeUploadSubtitle: 'PDF, Word, Excel, PPT અને ફોટા (100 MB સુધી)',
    homeBrowseFiles: 'ફોનમાંથી પસંદ કરો',
    homeScanQr: 'કિઓસ્ક QR સ્કેન કરો',
    homeTakePhoto: 'ફોટો લો',
    homeHowToPrint: 'પ્રિન્ટ કેવી રીતે કરવું',
    homeReadyToPrint: 'પ્રિન્ટ માટે તૈયાર',
    homeContinueToPrint: 'પ્રિન્ટ તરફ આગળ વધો',
    scannerTitle: 'કિઓસ્ક QR સ્કેન કરો',
    scannerSubtitle: 'પ્રિન્ટર સ્ક્રીન પરના QR કોડ તરફ કેમેરા રાખો',
    scannerBack: 'પાછા જાઓ',
    filesTitle: 'સેવ કરેલી ફાઇલો',
    filesSearchPlaceholder: 'ફાઇલ અથવા પ્રકાર શોધો...',
    editorTitle: 'પેજ એડિટ કરો',
    previewPrintTitle: 'પ્રિન્ટ સેટિંગ્સ',
    payAndPrint: 'સમીક્ષા અને ચુકવણી',
    summaryTitle: 'ઓર્ડર સારાંશ',
    accountTitle: 'મારું એકાઉન્ટ',
    walletTitle: 'પ્રિન્ટ પોઇન્ટ વોલેટ',
    addMoney: 'પૈસા ઉમેરો',
    myOrders: 'મારા ઓર્ડર',
    savedFiles: 'સેવ કરેલી ફાઇલો',
    notifications: 'સૂચનાઓ',
    language: 'ભાષા',
    helpSupport: 'મદદ અને સપોર્ટ',
    signOut: 'સાઇન આઉટ',
    toolsTitle: 'ડોક્યુમેન્ટ ટૂલ્સ',
  },
  हिन्दी: {
    navHome: 'होम',
    navFiles: 'फाइलें',
    navScan: 'स्कैन',
    navTools: 'टूल्स',
    navAccount: 'अकाउंट',
    homeUploadTitle: 'प्रिंट के लिए दस्तावेज़ जोड़ें',
    homeUploadSubtitle: 'PDF, Word, Excel, PPT और इमेज (100 MB तक)',
    homeBrowseFiles: 'डिवाइस से चुनें',
    homeScanQr: 'कियोस्क QR स्कैन करें',
    homeTakePhoto: 'फ़ोटो लें',
    homeHowToPrint: 'प्रिंट कैसे करें',
    homeReadyToPrint: 'प्रिंट के लिए तैयार',
    homeContinueToPrint: 'प्रिंट जारी रखें',
    scannerTitle: 'कियोस्क QR स्कैन करें',
    scannerSubtitle: 'प्रिंटर स्क्रीन पर दिख रहे QR कोड पर कैमरा रखें',
    scannerBack: 'वापस',
    filesTitle: 'सेव की गई फाइलें',
    filesSearchPlaceholder: 'दस्तावेज़ या फ़ाइल प्रकार खोजें...',
    editorTitle: 'पेज संपादित करें',
    previewPrintTitle: 'प्रिंट सेटिंग्स',
    payAndPrint: 'समीक्षा और भुगतान',
    summaryTitle: 'ऑर्डर सारांश',
    accountTitle: 'मेरा अकाउंट',
    walletTitle: 'प्रिंट पॉइंट वॉलेट',
    addMoney: 'पैसे जोड़ें',
    myOrders: 'मेरे ऑर्डर',
    savedFiles: 'सेव की गई फाइलें',
    notifications: 'सूचनाएं',
    language: 'भाषा',
    helpSupport: 'सहायता और समर्थन',
    signOut: 'साइन आउट',
    toolsTitle: 'दस्तावेज़ टूल्स',
  },
};

export function getTranslation(language: SupportedLanguage): TranslationDictionary {
  return TRANSLATIONS[language] || TRANSLATIONS.English;
}

export function useTranslation(): {
  t: TranslationDictionary;
  language: SupportedLanguage;
} {
  const { profile } = useUserProfile();
  return {
    t: getTranslation(profile.language),
    language: profile.language,
  };
}
