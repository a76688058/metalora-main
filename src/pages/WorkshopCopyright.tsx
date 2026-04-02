import React from 'react';
import { useNavigate } from 'react-router-dom';
import CopyrightPage from '../components/Workshop/CopyrightPage';

export default function WorkshopCopyright() {
  const navigate = useNavigate();

  const handleAgree = () => {
    // Navigate to Single Production directly after agreement
    navigate('/workshop/single');
  };

  return (
    <div className="min-h-screen bg-black">
      <CopyrightPage onAgree={handleAgree} />
    </div>
  );
}
