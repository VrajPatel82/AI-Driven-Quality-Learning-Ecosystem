import ResourceManagement from '../../components/shared/ResourceManagement';

export default function SuperAdminStorage() {
  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-heading">Storage</h1>
      </div>

      <ResourceManagement role="super_admin" />
    </div>
  );
}
