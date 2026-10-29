import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { StudentSyncProvider } from './context/StudentSyncContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <StudentSyncProvider>
          <App />
          <Toaster position="top-right" />
        </StudentSyncProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
