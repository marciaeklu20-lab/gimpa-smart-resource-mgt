// src/app/context/ThemeContext.jsx
"use client";

import { createContext, useState, useEffect } from 'react';

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('light');

  // Load saved theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('gimpaTheme');
    if (savedTheme) setTheme(savedTheme);
  }, []);

  // Apply theme to CSS variables and body class
  useEffect(() => {
    localStorage.setItem('gimpaTheme', theme);

    const root = document.documentElement;
    const body = document.body;

    if (theme === 'light') {
      root.style.setProperty('--bg-color', '#ffffff');        // workspace background
      root.style.setProperty('--text-color', '#003366');      // general text
      root.style.setProperty('--header-text', '#003366');    // header text
      root.style.setProperty('--header-accent', '#003366');  // header border
      body.classList.remove('dark-theme');
    } else {
      root.style.setProperty('--bg-color', '#003366');       // workspace background
      root.style.setProperty('--text-color', '#ffffff');     // general text
      root.style.setProperty('--header-text', '#ffffff');    // header text
      root.style.setProperty('--header-accent', '#ffffff');  // header border
      body.classList.add('dark-theme');
    }
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};