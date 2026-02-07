/**
 * Min Heap
 *
 * Priority queue implementation for A* pathfinding.
 */

/**
 * Min heap (priority queue) with custom comparator.
 */
export class MinHeap<T> {
  private items: T[] = []

  constructor(private compare: (a: T, b: T) => number) {}

  /**
   * Add item to heap
   */
  push(item: T): void {
    this.items.push(item)
    this.bubbleUp(this.items.length - 1)
  }

  /**
   * Remove and return smallest item
   */
  pop(): T | undefined {
    if (this.items.length === 0) return undefined
    if (this.items.length === 1) return this.items.pop()

    const result = this.items[0]
    this.items[0] = this.items.pop()!
    this.bubbleDown(0)
    return result
  }

  /**
   * Peek at smallest item without removing
   */
  peek(): T | undefined {
    return this.items[0]
  }

  /**
   * Check if heap is empty
   */
  isEmpty(): boolean {
    return this.items.length === 0
  }

  /**
   * Get heap size
   */
  size(): number {
    return this.items.length
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.items = []
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.compare(this.items[index], this.items[parent]) >= 0) break
      ;[this.items[index], this.items[parent]] = [this.items[parent], this.items[index]]
      index = parent
    }
  }

  private bubbleDown(index: number): void {
    const length = this.items.length
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const left = 2 * index + 1
      const right = 2 * index + 2
      let smallest = index

      if (left < length && this.compare(this.items[left], this.items[smallest]) < 0) {
        smallest = left
      }
      if (right < length && this.compare(this.items[right], this.items[smallest]) < 0) {
        smallest = right
      }
      if (smallest === index) break
      ;[this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]]
      index = smallest
    }
  }
}
