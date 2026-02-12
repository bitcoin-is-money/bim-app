#!/bin/bash
# Tom Hale, 2016. MIT Licence.
# Print out 256 colours, with each number printed in its corresponding colour
# See http://askubuntu.com/questions/821157/print-a-256-color-test-pattern-in-the-terminal/821163#821163

set -eu

printable_colours=256

# Return a colour that contrasts with the given colour
function contrast_colour {
  local r g b luminance
  colour="$1"

  if (( colour < 16 )); then
    (( colour == 0 )) && printf "15" || printf "0"
    return
  fi

  if (( colour > 231 )); then # Greyscale ramp
    (( colour < 244 )) && printf "15" || printf "0"
    return
  fi

  # 6x6x6 colour cube = 16 + 36*R + 6*G + B
  g=$(( ((colour-16) % 36) / 6 ))
  (( g > 2)) && printf "0" || printf "15"
}

# Print a coloured block with the number of that colour
function print_colour {
  local colour="$1" contrast
  contrast=$(contrast_colour "$1")
  printf "\e[48;5;%sm" "$colour"                # Start block of colour
  printf "\e[38;5;%sm%3d" "$contrast" "$colour"  # In contrast, print number
  printf "\e[0m "                                # Reset colour
}

# Starting at $1, print a run of $2 colours
function print_run {
  local i
  for (( i = "$1"; i < "$1" + "$2" && i < printable_colours; i++ )); do
    print_colour "$i"
  done
  printf " "
}

# Print blocks of colours
function print_blocks {
  local start="$1" i
  local end="$2"
  local block_cols="$3"
  local block_rows="$4"
  local blocks_per_line="$5"
  local block_length=$((block_cols * block_rows))

  for (( i = start; i <= end; i += (blocks_per_line-1) * block_length )); do
    printf "\n"
    for (( row = 0; row < block_rows; row++ )); do
      for (( block = 0; block < blocks_per_line; block++ )); do
        print_run $(( i + (block * block_length) )) "$block_cols"
      done
      (( i += block_cols ))
      printf "\n"
    done
  done
}

echo "=== 16 Standard Colors ==="
print_run 0 16
printf "\n"

echo ""
echo "=== 216 Color Cube (6x6x6) ==="
print_blocks 16 231 6 6 3

echo ""
echo "=== 24 Greyscale ==="
print_blocks 232 255 12 2 1
printf "\n"
