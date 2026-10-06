import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RealtimeProvider, useRealtime } from './context/RealtimeContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { AuthModal } from './components/AuthModal';
import { HomePage } from './pages/HomePage';
import { TournamentsPage } from './pages/TournamentsPage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import { MatchRoomPage } from './pages/MatchRoomPage';
import { TeamsPage } from './pages/TeamsPage';
import { PlayerProfilePage } from './pages/PlayerProfilePage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { RulesPage } from './pages/RulesPage';
import { Tournament, Match } from './types';

function MainApp() {
  const { user } = useAuth();
  const { subscribe } = useRealtime();

  const [currentTab, setCurrentTab] = useState<string>('home');
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('tourn-cryo-1');
  const [selectedMatchId, setSelectedMatchId] = useState<string>('match-1');
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

  // Global Data
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchGlobalData = async () => {
    try {
      const [tRes, mRes] = await Promise.all([
        fetch('/api/tournaments'),
        fetch('/api/matches')
      ]);
      if (tRes.ok) {
        const tData = await tRes.json();
        setTournaments(tData.tournaments || []);
      }
      if (mRes.ok) {
        const mData = await mRes.json();
        setMatches(mData.matches || []);
      }
    } catch (err) {
      console.error('Error fetching global tournament data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGlobalData();
    const unsub = subscribe('*', () => {
      fetchGlobalData();
    });
    return unsub;
  }, []);

  const handleSelectTournament = (tournId: string) => {
    setSelectedTournamentId(tournId);
    setCurrentTab('tournament-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectMatch = (matchId: string) => {
    setSelectedMatchId(matchId);
    setCurrentTab('match-room');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderContent = () => {
    switch (currentTab) {
      case 'home':
        return (
          <HomePage
            tournaments={tournaments}
            matches={matches}
            onSelectTournament={handleSelectTournament}
            onSelectMatch={handleSelectMatch}
            setCurrentTab={setCurrentTab}
          />
        );
      case 'tournaments':
        return (
          <TournamentsPage
            tournaments={tournaments}
            onSelectTournament={handleSelectTournament}
          />
        );
      case 'tournament-detail':
        return (
          <TournamentDetailPage
            tournamentId={selectedTournamentId}
            onBack={() => setCurrentTab('tournaments')}
            onSelectMatch={handleSelectMatch}
          />
        );
      case 'match-room':
        return (
          <MatchRoomPage
            initialMatchId={selectedMatchId}
            onBackToTournament={(tournId) => {
              setSelectedTournamentId(tournId);
              setCurrentTab('tournament-detail');
            }}
          />
        );
      case 'teams':
        return <TeamsPage />;
      case 'profile':
        return <PlayerProfilePage />;
      case 'admin':
        return <AdminDashboardPage onSelectMatch={handleSelectMatch} />;
      case 'rules':
        return <RulesPage />;
      default:
        return (
          <HomePage
            tournaments={tournaments}
            matches={matches}
            onSelectTournament={handleSelectTournament}
            onSelectMatch={handleSelectMatch}
            setCurrentTab={setCurrentTab}
          />
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#080b11] text-[#e2e8f0]">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        openAuthModal={() => setAuthModalOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {loading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-mono text-slate-400">Booting Marathon Engine...</p>
            </div>
          </div>
        ) : (
          renderContent()
        )}
      </main>

      <Footer setCurrentTab={setCurrentTab} />

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <MainApp />
      </RealtimeProvider>
    </AuthProvider>
  );
}
