/**		      	    				  	  	  	 		 		       	 	 	         	 	    					 
 * Utility functions
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

/**
 * Format a message timestamp for display in chat bubbles.
 * Same calendar day: "10:32"
 * Same year:        "07-15 10:32"
 * Other year:       "2025-07-15 10:32"
 */
export function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isSameYear = date.getFullYear() === now.getFullYear()
  const hh = date.getHours().toString().padStart(2, '0')
  const mm = date.getMinutes().toString().padStart(2, '0')

  if (isSameYear) {
    return `${date.getMonth() + 1}-${date.getDate()} ${hh}:${mm}`
  }
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${hh}:${mm}`
}

/**
 * Compact time-only format for inline display next to a name (e.g. "Vortex 17:43").
 * Date context is provided by the date separator above, so only time is shown here.
 */
export function formatMessageTimeShort(timestamp: string): string {
  const date = new Date(timestamp)
  const hh = date.getHours().toString().padStart(2, '0')
  const mm = date.getMinutes().toString().padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Build a date-labelled divider string for separator display.
 * Today / Yesterday / "07-15" / "2025-07-15"
 */
export function formatDateSeparatorLabel(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return 'today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'yesterday'
  const isSameYear = date.getFullYear() === now.getFullYear()
  if (isSameYear) return `${date.getMonth() + 1}-${date.getDate()}`
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

/**
 * Check if two ISO timestamps fall on the same calendar day.
 */
export function isSameDay(t1: string, t2: string): boolean {
  const d1 = new Date(t1)
  const d2 = new Date(t2)
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
}
