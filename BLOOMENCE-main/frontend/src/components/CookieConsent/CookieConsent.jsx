import React, { useEffect, useState } from 'react';
import './cookie.css';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem('cookie_consent');
      if (!consent) setVisible(true);
    } catch (_) { setVisible(true); }
  }, []);

  const acceptAll = () => {
    try {
      localStorage.setItem('cookie_consent', 'all');
    } catch (_) {}
    document.cookie = 'cookie_consent=all; path=/; max-age=31536000';
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookie-banner">
      <div className="cookie-text">
        We use cookies to improve your experience. By clicking Accept, you agree to our use of cookies.
      </div>
      <div className="cookie-actions">
        <a className="link" href="#/PrivacyPolicy">Learn more</a>
        <button className="accept" onClick={acceptAll}>Accept all cookies</button>
      </div>
    </div>
  );
}
