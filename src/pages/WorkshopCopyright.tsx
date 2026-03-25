import React from 'react';
import { useNavigate } from 'react-router-dom';
import CopyrightPage from '../components/Workshop/CopyrightPage';

export default function WorkshopCopyright() {
  const navigate = useNavigate();

  const handleAgree = () => {
    // Navigate to Lobby after agreement
    navigate('/workshop/lobby');
  };

  return (
    <div className="min-h-screen bg-black">
      <CopyrightPage onAgree={handleAgree} />
    </div>
  );
}
