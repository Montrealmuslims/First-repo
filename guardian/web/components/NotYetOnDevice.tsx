/**
 * Shown next to settings that the current child app does not enforce yet.
 * The settings are saved and served to devices (GET /v1/device/policy), but
 * the child app only implements the remote lock today.
 */
export function NotYetOnDevice() {
  return (
    <p className="notice small" role="note">
      ⚠️ تطبيق الطفل الحالي لا يطبّق هذا الإعداد بعد (يدعم <strong>قفل الجهاز</strong> فقط). يُحفظ الإعداد ليعمل عند إضافة الدعم.
    </p>
  );
}
