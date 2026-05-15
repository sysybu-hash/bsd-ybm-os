import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { meckanoFetch } from '@/lib/meckano-fetch';
import { requireMeckanoSession } from '@/lib/meckano-route-auth';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await requireMeckanoSession(session);
    if ('error' in auth) return auth.error;
    const apiKey = auth.apiKey;

    const body = await request.json();
    const { startDate, endDate, employeeId, projectId, locationId } = body;

    // Convert dates to Unix timestamps
    const startTs = Math.floor(new Date(startDate).getTime() / 1000);
    const endTs = Math.floor(new Date(endDate).getTime() / 1000);

    // 1. Fetch Employees to map userId to userName
    const employeesRes = await meckanoFetch('users', apiKey);
    const employeesData = await employeesRes.json();
    const employeesMap = new Map();
    if (employeesData.status && employeesData.data) {
      employeesData.data.forEach((emp: any) => {
        employeesMap.set(emp.id, `${emp.firstName} ${emp.lastName}`);
      });
    }

    // 2. Fetch Task Entries (with project info)
    const taskEntriesRes = await meckanoFetch(`task-entry?start=${startTs}&end=${endTs}`, apiKey);
    const taskEntriesData = await taskEntriesRes.json();

    // 3. Fetch General Time Entries (Total attendance)
    const timeEntriesRes = await meckanoFetch(`time-entry?start=${startTs}&end=${endTs}`, apiKey);
    const timeEntriesData = await timeEntriesRes.json();
    
    if (!taskEntriesData.status && !timeEntriesData.status) {
      return NextResponse.json({ error: taskEntriesData.data?.message || timeEntriesData.data?.message || 'Meckano API error' }, { status: 400 });
    }

    const taskEntries = taskEntriesData.data || [];
    const timeEntries = timeEntriesData.data || [];
    
    // Group entries by user, date, and project
    const grouped = new Map();

    // --- Process Task Entries (Project Specific) ---
    taskEntries.sort((a: any, b: any) => a.ts - b.ts);
    const userLastTaskIn = new Map(); // userId_taskId -> ts

    taskEntries.forEach((entry: any) => {
      const userId = entry.userId;
      const taskId = entry.taskId;
      const key = `${userId}_${taskId}`;
      const date = new Date(entry.ts * 1000).toISOString().split('T')[0];
      const groupKey = `${userId}_${date}_${taskId}`;

      if (!entry.taskStop) {
        userLastTaskIn.set(key, entry.ts);
      } else {
        const inTs = userLastTaskIn.get(key);
        if (inTs) {
          const diffMs = (entry.ts - inTs) * 1000;
          const hours = diffMs / (1000 * 60 * 60);
          
          if (!grouped.has(groupKey)) {
            grouped.set(groupKey, {
              id: `task_${entry.id}`,
              date: date,
              employeeName: employeesMap.get(userId) || entry.userName || `User ${userId}`,
              employeeId: userId,
              project: entry.description || 'פרויקט',
              projectId: taskId,
              location: 'לא צוין',
              hours: 0
            });
          }
          
          const group = grouped.get(groupKey);
          group.hours += hours;
          userLastTaskIn.delete(key);
        }
      }
    });

    // --- Process General Time Entries (Attendance) ---
    // We want to find time that was NOT reported to a specific task
    timeEntries.sort((a: any, b: any) => a.ts - b.ts);
    const userLastTimeIn = new Map(); // userId -> ts
    const dailyTotalAttendance = new Map(); // userId_date -> hours

    timeEntries.forEach((entry: any) => {
      const userId = entry.userId;
      const date = new Date(entry.ts * 1000).toISOString().split('T')[0];
      const dayKey = `${userId}_${date}`;

      if (!entry.isOut) {
        userLastTimeIn.set(userId, entry.ts);
      } else {
        const inTs = userLastTimeIn.get(userId);
        if (inTs) {
          const diffMs = (entry.ts - inTs) * 1000;
          const hours = diffMs / (1000 * 60 * 60);
          dailyTotalAttendance.set(dayKey, (dailyTotalAttendance.get(dayKey) || 0) + hours);
          userLastTimeIn.delete(userId);
        }
      }
    });

    // For each user/day, calculate if there's "unassigned" time
    dailyTotalAttendance.forEach((totalHours, dayKey) => {
      const [userId, date] = dayKey.split('_');
      
      // Calculate total hours already assigned to tasks for this user/day
      let assignedHours = 0;
      grouped.forEach((group, groupKey) => {
        if (groupKey.startsWith(`${userId}_${date}_`)) {
          assignedHours += group.hours;
        }
      });

      const unassignedHours = totalHours - assignedHours;
      
      // If there's more than 5 minutes of unassigned time, add a "General" row
      if (unassignedHours > 0.08) { 
        const generalKey = `${userId}_${date}_general`;
        grouped.set(generalKey, {
          id: `gen_${userId}_${date}`,
          date: date,
          employeeName: employeesMap.get(parseInt(userId)) || `User ${userId}`,
          employeeId: userId,
          project: 'כללי / משרד',
          projectId: 'general',
          location: 'לא צוין',
          hours: Math.round(unassignedHours * 100) / 100
        });
      }
    });

    let mappedReports = Array.from(grouped.values());

    // Apply filters
    if (employeeId && employeeId !== 'all') {
      mappedReports = mappedReports.filter(r => r.employeeId.toString() === employeeId.toString());
    }
    if (projectId && projectId !== 'all') {
      mappedReports = mappedReports.filter(r => r.projectId.toString() === projectId.toString());
    }

    const totalHours = mappedReports.reduce((sum: number, r: any) => sum + r.hours, 0);

    return NextResponse.json({ 
      success: true, 
      reports: mappedReports,
      summary: {
        totalHours: Math.round(totalHours * 100) / 100,
        daysCount: mappedReports.length
      }
    });
  } catch (error: any) {
    console.error("Meckano Reports Error:", error);
    return NextResponse.json({ error: 'Failed to fetch Meckano reports', details: error.message }, { status: 500 });
  }
}
