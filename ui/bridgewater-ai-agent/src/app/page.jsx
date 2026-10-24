'use client';

import React from 'react';
import TopNav from '@/components/TopNav';
import Hero from '@/components/Hero';
import RoleCards from '@/components/RoleCards';
import WorkflowPreview from '@/components/WorkflowPreview';
import FeaturesSection from '@/components/FeaturesSection';
import Footer from '@/components/Footer';
import TidesBackground from '@/components/TidesBackground';

export default function Home() {
  return (
    <>
      <TidesBackground />
      <div className="relative z-10 min-h-screen">
        {/* Navigation */}
        <TopNav />

        {/* Content */}
        <main className="pt-16">
          {/* Hero Section */}
          <Hero />

          {/* Role Cards */}
          <RoleCards />

          {/* Features Section */}
          <FeaturesSection />

          {/* Workflow Preview */}
          <WorkflowPreview />
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </>
  );
}
