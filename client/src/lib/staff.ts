export type StaffRole = 'manager' | 'assistant' | 'office';
export type StaffMember = { maintenanceManager?: boolean; maintenanceAppointmentDate?: string; id: string; code: string; name: string; officeName: string; role: StaffRole; active: boolean; appointmentDate: string; qualification: string };
export const staffRoles: Record<StaffRole, string> = { manager: '運行管理者', assistant: '選任された補助者', office: '事務員' };
export const emptyStaff: StaffMember[] = [];
export const canExecuteRollCall = (member: StaffMember) => member.active && (member.role === 'manager' || member.role === 'assistant');
