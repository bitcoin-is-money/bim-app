#!/usr/bin/env bash
#
# ANSI color matrix: text colors (rows) x background colors (columns)
# Usage: ./ansi-color-matrix.sh [--bold]
#   --bold  Show bold variants only (default: both normal and bold)

BOLD_ONLY=false
[[ "$1" == "--bold" ]] && BOLD_ONLY=true

fg_names=(black red green yellow blue magenta cyan white brBlack brRed brGreen brYellow brBlue brMagenta brCyan brWhite)
fg_codes=(30 31 32 33 34 35 36 37 90 91 92 93 94 95 96 97)

bg_names=(none black red green yellow blue magenta cyan white brBlack brRed brGreen brYellow brBlue brMagenta brCyan brWhite)
bg_codes=(0 40 41 42 43 44 45 46 47 100 101 102 103 104 105 106 107)

print_matrix() {
  local bold_prefix="$1"
  local label_prefix="$2"

  # Header
  printf "%-12s" ""
  for bg_name in "${bg_names[@]}"; do
    printf "%-10s" "$bg_name"
  done
  echo

  # Rows
  for i in "${!fg_names[@]}"; do
    printf "%-12s" "${label_prefix}${fg_names[$i]}"
    for j in "${!bg_codes[@]}"; do
      local bg=""
      [[ "${bg_codes[$j]}" -ne 0 ]] && bg="\e[${bg_codes[$j]}m"
      printf "${bg}${bold_prefix}\e[${fg_codes[$i]}m %-7s \e[0m" "SAMPLE"
    done
    echo
  done
  return
}

if $BOLD_ONLY; then
  echo "=== BOLD ==="
  echo
  print_matrix "\e[1m" ""
else
  echo "=== NORMAL ==="
  echo
  print_matrix "" ""
  echo
  echo "=== BOLD ==="
  echo
  print_matrix "\e[1m" ""
fi
