import { createContext, useContext, useState, useCallback } from 'react';

/**
 * StudentSyncContext provides an authoritative event bus and single-source-of-truth
 * cache for current student data mutations (division changes, semester promotions, profile updates).
 * Whenever Academic Administrator updates a student, calling notifyStudentUpdated(studentId, updatedData)
 * alerts every subscriber component (lists, profiles, dashboards, enrollment) to revalidate.
 */
const StudentSyncContext = createContext(null);

export const useStudentSync = () => {
  const context = useContext(StudentSyncContext);
  if (!context) {
    throw new Error('useStudentSync must be used within a StudentSyncProvider');
  }
  return context;
};

const INITIAL_DEPT_STUDENTS = [];

export const StudentSyncProvider = ({ children }) => {
  // Map of studentId -> authoritative current student profile override
  const [studentOverrides, setStudentOverrides] = useState(() => {
    try {
      const saved = localStorage.getItem('globalflow_student_overrides');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Local authoritative store of student records (merged with database & imported records)
  const [authoritativeStudents, setAuthoritativeStudents] = useState(() => {
    try {
      const saved = localStorage.getItem('globalflow_authoritative_students');
      return saved ? JSON.parse(saved) : INITIAL_DEPT_STUDENTS;
    } catch {
      return INITIAL_DEPT_STUDENTS;
    }
  });

  // Timestamp ticker to trigger re-fetches in subscribed components
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState(Date.now());
  const [apiError, setApiError] = useState(null);

  /**
   * Called when any student record is mutated anywhere in the application
   */
  const notifyStudentUpdated = useCallback((studentId, updatedFields) => {
    if (!studentId) return;
    setStudentOverrides((prev) => {
      const updated = {
        ...prev,
        [studentId]: {
          ...(prev[studentId] || {}),
          ...updatedFields,
          _updatedAt: Date.now()
        }
      };
      try {
        localStorage.setItem('globalflow_student_overrides', JSON.stringify(updated));
      } catch (e) {
        console.error('Storage error', e);
      }
      return updated;
    });

    setAuthoritativeStudents((prev) => {
      const updated = prev.map(s => {
        if (s._id === studentId || s.enrollmentNumber === studentId) {
          return { ...s, ...updatedFields, _updatedAt: Date.now() };
        }
        return s;
      });
      try {
        localStorage.setItem('globalflow_authoritative_students', JSON.stringify(updated));
      } catch (e) {
        console.error('Storage error', e);
      }
      return updated;
    });

    setLastSyncTimestamp(Date.now());
  }, []);

  /**
   * Called when new students are created or imported via CSV
   */
  const importAuthoritativeStudents = useCallback((newStudents) => {
    if (!Array.isArray(newStudents) || newStudents.length === 0) return;
    setAuthoritativeStudents((prev) => {
      // Merge by enrollmentNumber or _id to avoid duplicates
      const existingMap = new Map();
      prev.forEach(s => {
        const key = s.enrollmentNumber || s._id;
        if (key) existingMap.set(key, s);
      });

      newStudents.forEach(s => {
        const key = s.enrollmentNumber || s._id;
        if (key) {
          existingMap.set(key, { ...existingMap.get(key), ...s, _updatedAt: Date.now() });
        }
      });

      const updated = Array.from(existingMap.values());
      try {
        localStorage.setItem('globalflow_authoritative_students', JSON.stringify(updated));
      } catch (e) {
        console.error('Storage error', e);
      }
      return updated;
    });

    setLastSyncTimestamp(Date.now());
  }, []);

  /**
   * Helper that merges backend student record with any pending authoritative local updates
   */
  const getAuthoritativeStudent = useCallback((student) => {
    if (!student || !student._id) return student;
    const override = studentOverrides[student._id] || studentOverrides[student.enrollmentNumber];
    if (!override) return student;
    return {
      ...student,
      ...override
    };
  }, [studentOverrides]);

  /**
   * Syncs server response into authoritative store
   */
  const syncServerStudents = useCallback((serverStudents, targetDeptId) => {
    if (!Array.isArray(serverStudents)) return;
    setAuthoritativeStudents((prev) => {
      const serverMap = new Map();
      serverStudents.forEach(s => {
        const key = s.enrollmentNumber || s._id;
        if (key) serverMap.set(key, s);
      });

      // Keep students from OTHER departments that were not part of this department fetch
      const kept = prev.filter(s => {
        const sDept = s.department?._id || s.department;
        if (targetDeptId && String(sDept) === String(targetDeptId)) {
          // For the target department, the server is authoritative
          return false;
        }
        return !serverMap.has(s.enrollmentNumber || s._id);
      });

      const mergedMap = new Map();
      serverStudents.forEach(s => {
        const key = s.enrollmentNumber || s._id;
        if (key) mergedMap.set(key, s);
      });
      kept.forEach(s => {
        const key = s.enrollmentNumber || s._id;
        if (key && !mergedMap.has(key)) mergedMap.set(key, s);
      });

      const merged = Array.from(mergedMap.values()).map(s => {
        const override = studentOverrides[s._id] || studentOverrides[s.enrollmentNumber];
        return override ? { ...s, ...override } : s;
      });

      // Defensive check: If contents are identical, preserve existing array reference
      if (prev.length === merged.length) {
        let isIdentical = true;
        for (let i = 0; i < prev.length; i++) {
          const p = prev[i];
          const m = merged[i];
          if (
            p._id !== m._id ||
            p.currentSemester !== m.currentSemester ||
            p.division !== m.division ||
            p.name !== m.name ||
            p.email !== m.email ||
            p.enrollmentNumber !== m.enrollmentNumber
          ) {
            isIdentical = false;
            break;
          }
        }
        if (isIdentical) {
          return prev;
        }
      }

      try {
        localStorage.setItem('globalflow_authoritative_students', JSON.stringify(merged));
      } catch (e) {
        console.error('Storage error', e);
      }
      return merged;
    });
    setApiError(null);
  }, [studentOverrides]);

  return (
    <StudentSyncContext.Provider
      value={{
        studentOverrides,
        authoritativeStudents,
        lastSyncTimestamp,
        apiError,
        setApiError,
        notifyStudentUpdated,
        importAuthoritativeStudents,
        getAuthoritativeStudent,
        syncServerStudents
      }}
    >
      {children}
    </StudentSyncContext.Provider>
  );
};
