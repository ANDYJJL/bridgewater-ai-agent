import Link from 'next/link';
import { roles } from '@/data/mockData';

const ROLE_ROUTES = {
  'junior-analyst':   '/junior-analyst/step-1',
  'senior-analyst':   '/senior-analyst',
  'risk-team':        '/risk-team',
  'portfolio-manager': '/portfolio-manager',
};

// Grayscale palette — light (Junior) → dark (Portfolio Manager)
const cardStyle = {
  'junior-analyst': {
    background: 'linear-gradient(135deg, #FFFFFF 0%, #E7E7E7 100%)',
    borderColor: '#D1D1D1',
  },
  'senior-analyst': {
    background: 'linear-gradient(135deg, #E7E7E7 0%, #D1D1D1 100%)',
    borderColor: '#B6B6B6',
  },
  'risk-team': {
    background: 'linear-gradient(135deg, #D1D1D1 0%, #B6B6B6 100%)',
    borderColor: '#9B9B9B',
  },
  'portfolio-manager': {
    background: 'linear-gradient(135deg, #B6B6B6 0%, #9B9B9B 100%)',
    borderColor: '#808080',
  },
};

export default function RoleCards() {
  return (
    <section className="py-20 px-8" id="role-selection">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-20">
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            Choose Your Role
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Each role offers tailored tools and perspectives for institutional investment research
          </p>
        </div>

        {/* Divider Line */}
        <div className="w-24 h-1.5 bg-gray-900 mx-auto mb-16"></div>

        {/* Role Cards Grid */}
        <div className="grid md:grid-cols-2 gap-8">
          {roles.map((role) => (
            <div
              key={role.id}
              className="group cursor-pointer rounded-2xl p-10 relative overflow-hidden
                         transition-all duration-700 ease-in-out
                         hover:shadow-2xl hover:scale-[1.02]"
              style={{
                background: cardStyle[role.id].background,
                border: `1px solid ${cardStyle[role.id].borderColor}`,
              }}
            >
              {/* Subtle background accent */}
              <div className="absolute top-0 right-0 w-40 h-40 bg-black/5 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10">
                {/* Header row */}
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-3xl font-bold text-gray-900 mb-2">
                      {role.title}
                    </h3>
                    <div className="w-12 h-1 bg-gray-400 rounded-full" />
                  </div>
                  <div
                    className="w-10 h-10 rounded-full bg-black/10 flex items-center justify-center
                               opacity-0 group-hover:opacity-100
                               transition-opacity duration-700 ease-in-out"
                  >
                    <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                {/* Description */}
                <p className="text-gray-700 mb-8 leading-relaxed text-lg mt-6">
                  {role.description}
                </p>

                {/* Capabilities — slow fade + expand on hover */}
                <div
                  className="overflow-hidden
                             max-h-0 opacity-0
                             group-hover:max-h-48 group-hover:opacity-100
                             transition-all duration-700 ease-in-out"
                >
                  <div className="pb-8">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest mb-4">
                      Key Capabilities
                    </p>
                    {role.capabilities.map((capability, idx) => (
                      <div key={idx} className="flex items-center gap-3 mb-3">
                        <div className="w-2 h-2 rounded-full bg-gray-500 flex-shrink-0" />
                        <span className="text-gray-600 text-sm">{capability}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA Button */}
                <Link
                  href={ROLE_ROUTES[role.id] ?? '/'}
                  className="block w-full py-4 bg-gray-900 rounded-xl font-bold text-white text-lg text-center
                             shadow-lg hover:bg-gray-700 hover:shadow-xl
                             transition-all duration-500 ease-in-out"
                >
                  Start as {role.title}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
