'use client';

import React from 'react';
import TopNav from '@/components/TopNav';
import Footer from '@/components/Footer';

export default function JuniorAnalystLayout({ children }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Navigation */}
      <TopNav />

      {/* Main Content */}
      <main className="flex-1 pt-16">
        {children}
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
