import ResourceManagement from '../../components/shared/ResourceManagement';

export default function UniversityStorage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">Storage</h1>
      </div>

      <ResourceManagement role="university_admin" />
    </div>
  );
}
