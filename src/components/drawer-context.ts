import { createContext, useContext } from 'react';

/** Lets inputs switch to the sheet-aware TextInput so the keyboard lifts the drawer. */
export const InDrawerContext = createContext(false);
export const useInDrawer = () => useContext(InDrawerContext);
