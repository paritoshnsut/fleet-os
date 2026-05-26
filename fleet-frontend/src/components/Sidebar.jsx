import { useState } from 'react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import {
  Bus, Shield, MapPin, LayoutDashboard,
  Activity, FileText, Zap,
  ChevronLeft, ChevronRight, AlertTriangle, ClipboardList,
  LogOut, Users, Route, Settings2, BarChart2, LineChart, ShieldCheck, Link2, SlidersHorizontal,
} from 'lucide-react';

const NAV = [
  {
    label: 'Fleet Intelligence',
    icon: Bus,
    id: 'fleet',
    roles: ['fleet_operator'],
    children: [
      { label: 'Live Map',            id: 'fleet-map',      icon: MapPin        },
      { label: 'Alert Center',        id: 'fleet-alerts',   icon: AlertTriangle },
      { label: 'Driver Scorecards',   id: 'fleet-drivers',  icon: Activity      },
      { label: 'GCC Compliance',      id: 'fleet-gcc',      icon: FileText      },
      { label: 'EV Charging',         id: 'fleet-ev',       icon: Zap           },
      // { label: 'Shift Handover',      id: 'fleet-handover', icon: ClipboardList },
      { label: 'Trip Defect Reports', id: 'fleet-defects',  icon: ClipboardList },
      { label: 'Fleet Setup',         id: 'fleet-setup',    icon: Settings2     },
    ],
  },
  {
    label: 'Internal Analysis',
    icon: LineChart,
    id: 'analysis',
    roles: ['internal_analyst'],
    children: [
      { label: 'Trip Planner',       id: 'trip-planner',     icon: Route    },
      { label: 'TCO Cost Analysis',  id: 'tco-analysis',     icon: BarChart2 },
      { label: 'Charging Planner',   id: 'charging-planner', icon: Zap      },
      { label: 'Scenario Engine',    id: 'scenario-engine',  icon: SlidersHorizontal },
    ],
  },
  {
    label: 'Client Portal',
    icon: Link2,
    id: 'portal',
    roles: ['admin'],
    children: [
      { label: 'Client Sessions', id: 'client-sessions', icon: Users },
    ],
  },
  {
    label: 'SafeRide',
    icon: Shield,
    id: 'saferide',
    roles: ['school_staff', 'parent'],
    children: [
      { label: 'School Dashboard', id: 'safe-school', icon: LayoutDashboard, roles: ['school_staff'] },
      { label: 'Admin Panel',      id: 'safe-admin',  icon: ShieldCheck,     roles: ['school_staff'] },
      { label: 'Parent View',      id: 'safe-parent', icon: Users,           roles: ['parent']       },
    ],
  },
];

const ROLE_LABEL = {
  admin:             'Admin',
  fleet_operator:    'Fleet Operator',
  internal_analyst:  'Internal Analyst',
  school_staff:      'School Staff',
  parent:            'Parent',
};

export default function Sidebar({ activePage, setActivePage }) {
  const { profile, signOut } = useAuth();
  const role = profile?.role ?? null;

  const [collapsed,    setCollapsed]    = useState(false);
  const [openSections, setOpenSections] = useState({ fleet: true, analysis: true, saferide: true, portal: true });

  function toggleSection(id) {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  }

  // Filter sections and children visible to current role
  const visibleNav = NAV
    .filter(s => !role || role === 'admin' || s.roles.includes(role))
    .map(s => ({
      ...s,
      children: s.children.filter(c => !c.roles || !role || role === 'admin' || c.roles.includes(role)),
    }));

  return (
    <aside className={cn(
      'relative flex flex-col bg-white border-r border-slate-100 transition-all duration-300 h-screen',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className={cn(
        'flex items-center border-b border-slate-100 transition-all',
        collapsed ? 'justify-center px-3 py-4' : 'gap-3 px-4 py-4'
      )}>
        {collapsed ? (
          <img src="/tata-logo.svg" alt="Tata Motors" className="h-8 w-auto" />
        ) : (
          <>
            <img src="/tata-logo.svg" alt="Tata Motors" className="h-10 w-auto flex-shrink-0" />
            <div>
              <p className="text-slate-900 font-bold text-sm leading-tight">FleetOS</p>
              <p className="text-slate-400 text-xs">Tata Motors CV</p>
            </div>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 scrollbar-hide">
        {visibleNav.map(section => {
          const Icon = section.icon;
          const isOpen = openSections[section.id];

          return (
            <div key={section.id} className="mb-1">
              <button
                onClick={() => toggleSection(section.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors rounded-none',
                  'hover:bg-slate-50',
                  isOpen ? 'text-slate-800' : 'text-slate-400'
                )}
              >
                <Icon size={18} className="flex-shrink-0" />
                {!collapsed && (
                  <>
                    <span className="text-sm font-medium flex-1">{section.label}</span>
                    <ChevronRight
                      size={14}
                      className={cn('transition-transform text-slate-300', isOpen && 'rotate-90')}
                    />
                  </>
                )}
              </button>

              {isOpen && !collapsed && (
                <div className="ml-4 border-l border-slate-100 pl-2 pb-1">
                  {section.children.map(item => {
                    const ItemIcon = item.icon;
                    const isActive = activePage === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActivePage(item.id)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm rounded-lg transition-all mb-0.5',
                          isActive
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        )}
                      >
                        <ItemIcon size={14} className="flex-shrink-0" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(p => !p)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm
          flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors z-10"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* User + logout */}
      <div className="border-t border-slate-100 px-3 py-3">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="text-blue-600 text-xs font-bold">
                {profile?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-700 text-xs font-medium truncate">{profile?.full_name ?? 'User'}</p>
              <p className="text-slate-400 text-xs truncate">{ROLE_LABEL[role] ?? ''}</p>
            </div>
            <button
              onClick={signOut}
              className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors py-1"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </aside>
  );
}
