export type LeetCodeProblemSeed = {
  id: number;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  tags: string[];
  args: string;
  titleSlug: string;
};

export const leetcodeOneToHundredProblems: LeetCodeProblemSeed[] = [
  { id: 1, title: 'Two Sum', difficulty: 'Easy', tags: ['array', 'hash table'], args: '[[2, 7, 11, 15], 9]', titleSlug: 'two-sum' },
  { id: 2, title: 'Add Two Numbers', difficulty: 'Medium', tags: ['linked list', 'math', 'recursion'], args: '[[2, 4, 3], [5, 6, 4]]', titleSlug: 'add-two-numbers' },
  { id: 3, title: 'Longest Substring Without Repeating Characters', difficulty: 'Medium', tags: ['hash table', 'string', 'sliding window'], args: '["abcabcbb"]', titleSlug: 'longest-substring-without-repeating-characters' },
  { id: 4, title: 'Median of Two Sorted Arrays', difficulty: 'Hard', tags: ['array', 'binary search', 'divide and conquer'], args: '[[1, 3], [2]]', titleSlug: 'median-of-two-sorted-arrays' },
  { id: 5, title: 'Longest Palindromic Substring', difficulty: 'Medium', tags: ['string', 'dynamic programming'], args: '["babad"]', titleSlug: 'longest-palindromic-substring' },
  { id: 6, title: 'Zigzag Conversion', difficulty: 'Medium', tags: ['string'], args: '["PAYPALISHIRING", 3]', titleSlug: 'zigzag-conversion' },
  { id: 7, title: 'Reverse Integer', difficulty: 'Medium', tags: ['math'], args: '[123]', titleSlug: 'reverse-integer' },
  { id: 8, title: 'String to Integer (atoi)', difficulty: 'Medium', tags: ['string'], args: '["42"]', titleSlug: 'string-to-integer-atoi' },
  { id: 9, title: 'Palindrome Number', difficulty: 'Easy', tags: ['math'], args: '[121]', titleSlug: 'palindrome-number' },
 ];
