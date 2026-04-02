import React from 'react';
import { useNavigate } from 'react-router-dom';
import Cart from '../components/Cart';

export default function MyCollection() {
  const navigate = useNavigate();
  
  return (
    <Cart 
      isOpen={true} 
      onClose={() => navigate(-1)} 
    />
  );
}
